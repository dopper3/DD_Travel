import type { D1Database } from '@cloudflare/workers-types';
import {
  CompiledQuery,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryCompiler,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
} from 'kysely';

/**
 * Minimal Kysely dialect for Cloudflare D1.
 *
 * Differences from a stock SQLite dialect:
 * - Transactions are NO-OPS. D1 has no interactive transactions; each
 *   statement auto-commits. `db.transaction()` still works but is not atomic.
 * - JS values that D1 cannot bind are serialized: Date -> ISO-8601 string,
 *   boolean -> 0/1, plain objects/arrays -> JSON text, undefined -> null.
 * - D1 allows at most 100 bound parameters per query. Queries exceeding that
 *   (bulk inserts, long `in` lists) are rewritten with the parameters inlined
 *   as escaped SQL literals.
 */

const D1_MAX_BOUND_PARAMETERS = 100;

type D1BindValue = null | number | string | ArrayBuffer;

const serializeParameter = (value: unknown): D1BindValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    ) as ArrayBuffer;
  }
  return JSON.stringify(value);
};

const escapeLiteral = (value: D1BindValue): string => {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Cannot inline non-finite number');
    return String(value);
  }
  if (typeof value === 'string') {
    // Standard SQLite escaping: double the single quotes. SQLite has no
    // backslash escapes inside string literals.
    return `'${value.replaceAll("'", "''")}'`;
  }
  throw new Error('Cannot inline binary parameter into SQL');
};

/**
 * Replaces `?` placeholders (outside of string literals / quoted identifiers)
 * with inlined literals. Used only when a query exceeds D1's bound-parameter
 * limit.
 */
const inlineParameters = (sql: string, params: D1BindValue[]): string => {
  let result = '';
  let paramIndex = 0;
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]!;
    if (quote) {
      result += char;
      if (char === quote) {
        // A doubled quote is an escaped quote inside the literal.
        if (sql[i + 1] === quote) {
          result += quote;
          i++;
        } else {
          quote = null;
        }
      }
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
      result += char;
    } else if (char === '?') {
      const param = params[paramIndex++];
      if (param === undefined && paramIndex > params.length) {
        throw new Error('Parameter placeholder count exceeds parameter count');
      }
      result += escapeLiteral(param as D1BindValue);
    } else {
      result += char;
    }
  }

  if (paramIndex !== params.length) {
    throw new Error(
      `Parameter count mismatch while inlining: used ${paramIndex}, given ${params.length}`,
    );
  }
  return result;
};

class D1Connection implements DatabaseConnection {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const params = compiledQuery.parameters.map(serializeParameter);

    let statement;
    if (params.length > D1_MAX_BOUND_PARAMETERS) {
      statement = this.#db.prepare(inlineParameters(compiledQuery.sql, params));
    } else {
      statement = this.#db.prepare(compiledQuery.sql).bind(...params);
    }

    const response = await statement.all();
    if (response.error) {
      throw new Error(response.error);
    }

    const meta = response.meta as
      | { changes?: number; last_row_id?: number }
      | undefined;

    return {
      rows: (response.results ?? []) as R[],
      numAffectedRows: BigInt(meta?.changes ?? 0),
      insertId:
        meta?.last_row_id != null ? BigInt(meta.last_row_id) : undefined,
    };
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('D1 does not support streaming queries');
  }
}

class D1Driver implements Driver {
  readonly #db: D1Database;
  #warnedAboutTransactions = false;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1Connection(this.#db);
  }

  async beginTransaction(): Promise<void> {
    // D1 has no interactive transactions; every statement auto-commits.
    // Transaction blocks run non-atomically.
    if (!this.#warnedAboutTransactions) {
      this.#warnedAboutTransactions = true;
      console.warn(
        'db.transaction() is a no-op on D1: statements run without atomicity.',
      );
    }
  }

  async commitTransaction(): Promise<void> {}

  async rollbackTransaction(): Promise<void> {
    console.error(
      'Transaction rollback requested on D1, but D1 cannot roll back: earlier statements in this block have already been committed.',
    );
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}
}

export class D1Dialect implements Dialect {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  createAdapter() {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new D1Driver(this.#db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

/**
 * Converts D1/SQLite result values back to the JS types the app expects
 * (matching what the pg driver used to return):
 * - boolean columns come back as 0/1 -> boolean
 * - timestamp columns come back as ISO strings -> Date
 * - json columns (and json subquery aliases) come back as text -> parsed,
 *   with boolean keys inside the parsed payload normalized recursively.
 *
 * Column names are matched in both camelCase and snake_case since this plugin
 * may run before or after CamelCasePlugin depending on plugin order.
 */
const BOOLEAN_COLUMNS = new Set([
  'custom',
  'required',
  'active',
  'showMap',
  'showStats',
  'showFlightList',
  'showFlightNumbers',
  'showAirlines',
  'showAircraft',
  'showTimes',
  'showTracks',
  'showDates',
  'showSeat',
  'show_map',
  'show_stats',
  'show_flight_list',
  'show_flight_numbers',
  'show_airlines',
  'show_aircraft',
  'show_times',
  'show_tracks',
  'show_dates',
  'show_seat',
]);

const DATE_COLUMNS = new Set([
  'expiresAt',
  'createdAt',
  'updatedAt',
  'lastUsed',
  'expires_at',
  'created_at',
  'updated_at',
  'last_used',
]);

// JSON stored as data: parsed verbatim, keys untouched.
const STORED_JSON_COLUMNS = new Set([
  'config',
  'track',
  'defaultValue',
  'options',
  'validationJson',
  'value',
  'default_value',
  'validation_json',
]);

// Aliases produced by jsonObjectFrom/jsonArrayFrom subqueries. Their keys are
// baked into the SQL as snake_case string literals (CamelCasePlugin cannot
// reach inside JSON), so they are camelized after parsing.
const SUBQUERY_JSON_COLUMNS = new Set([
  'from',
  'to',
  'aircraft',
  'airline',
  'passengers',
  'user',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const camelize = (key: string): string =>
  key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

/**
 * Recursively normalizes a parsed JSON subquery payload: camelizes keys,
 * converts 0/1 booleans, and parses doubly-encoded nested subquery strings.
 */
const normalizeParsedJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeParsedJson);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const camelKey = camelize(key);
      if (BOOLEAN_COLUMNS.has(camelKey) && typeof entry === 'number') {
        result[camelKey] = entry !== 0;
      } else if (
        SUBQUERY_JSON_COLUMNS.has(camelKey) &&
        typeof entry === 'string' &&
        (entry.startsWith('{') || entry.startsWith('['))
      ) {
        // A doubly-encoded nested subquery object.
        result[camelKey] = normalizeParsedJson(parseJsonSafe(entry));
      } else {
        result[camelKey] = normalizeParsedJson(entry);
      }
    }
    return result;
  }
  return value;
};

const parseJsonSafe = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizeRow = (row: UnknownRow): UnknownRow => {
  for (const [key, value] of Object.entries(row)) {
    if (BOOLEAN_COLUMNS.has(key) && typeof value === 'number') {
      row[key] = value !== 0;
    } else if (
      DATE_COLUMNS.has(key) &&
      typeof value === 'string' &&
      ISO_DATE_RE.test(value)
    ) {
      row[key] = new Date(value);
    } else if (STORED_JSON_COLUMNS.has(key) && typeof value === 'string') {
      // Stored JSON data: parse verbatim, keys untouched.
      row[key] = parseJsonSafe(value);
    } else if (SUBQUERY_JSON_COLUMNS.has(key) && typeof value === 'string') {
      row[key] = normalizeParsedJson(parseJsonSafe(value));
    }
  }
  return row;
};

export class D1ResultPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return args.node;
  }

  async transformResult(
    args: PluginTransformResultArgs,
  ): Promise<QueryResult<UnknownRow>> {
    return {
      ...args.result,
      rows: args.result.rows.map(normalizeRow),
    };
  }
}
