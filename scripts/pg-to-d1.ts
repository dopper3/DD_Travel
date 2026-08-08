/**
 * Converts a pg_dump (plain format, COPY blocks) of the AirTrail Postgres
 * database into an SQL file of INSERT statements for D1/SQLite, matching the
 * schema in migrations/0001_init.sql.
 *
 * Usage: bun scripts/pg-to-d1.ts <dump.sql> <out.sql>
 *
 * Transforms:
 * - booleans t/f -> 1/0
 * - timestamptz "YYYY-MM-DD HH:MM:SS[.fff]+00" -> ISO-8601 "…T…Z"
 * - argon2 password hashes cannot be verified on Workers, so each user with a
 *   password gets a fresh random temporary password (PBKDF2, same format as
 *   src/lib/server/utils/hash.ts) which is printed to the console.
 * - session / oauth_link_token / _prisma_migrations rows are skipped
 *   (ephemeral; users just log in again).
 *
 * Also up-converts dumps taken before the latest Prisma migrations:
 * - seat -> flight_passenger, moving flight.flight_reason onto each passenger
 *   and deleting flights without passengers (20260714 migrations)
 * - visited_country numeric codes -> ISO 3166-1 alpha-2 (20260713 migration)
 */

// Workers rejects PBKDF2 iteration counts above 100,000.
const PBKDF2_ITERATIONS = 100_000;

const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    32 * 8,
  );
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
};

const randomPassword = (): string => {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

// FK-safe insert order. Tables not listed are skipped.
const TABLE_ORDER = [
  'user',
  'airport',
  'aircraft',
  'airline',
  'flight',
  'flight_passenger',
  'flight_track',
  'visited_country',
  'api_key',
  'public_share',
  'custom_field_definition',
  'custom_field_value',
  'app_config',
];

const BOOLEAN_COLUMNS: Record<string, Set<string>> = {
  airport: new Set(['custom']),
  public_share: new Set([
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
  ]),
  custom_field_definition: new Set(['required', 'active']),
};

const TIMESTAMP_COLUMNS: Record<string, Set<string>> = {
  api_key: new Set(['created_at', 'last_used']),
  public_share: new Set(['expires_at', 'created_at']),
  flight_track: new Set(['created_at', 'updated_at']),
  custom_field_definition: new Set(['created_at', 'updated_at']),
  custom_field_value: new Set(['created_at', 'updated_at']),
};

// Statements are kept well under D1's 100KB SQL length limit.
const MAX_STATEMENT_BYTES = 90_000;
const MAX_ROWS_PER_INSERT = 50;

const unescapeCopyValue = (raw: string): string | null => {
  if (raw === '\\N') return null;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = raw[++i];
    switch (next) {
      case '\\': out += '\\'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'v': out += '\v'; break;
      case undefined: out += '\\'; break;
      default:
        console.warn(`Unknown COPY escape \\${next}; keeping literally`);
        out += `\\${next}`;
    }
  }
  return out;
};

const toIsoTimestamp = (value: string): string => {
  const m = value.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2}(?::?\d{2})?)?$/,
  );
  if (m && (!m[4] || m[4] === '+00' || m[4] === '+0000' || m[4] === '+00:00')) {
    return `${m[1]}T${m[2]}${m[3] ?? ''}Z`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Cannot parse timestamp: ${value}`);
  }
  console.warn(`Non-UTC or unusual timestamp normalized: ${value}`);
  return parsed.toISOString();
};

// ISO 3166-1 numeric -> alpha-2, from the 20260713220000 Prisma migration.
const NUMERIC_TO_ALPHA2: Record<string, string> = {"4":"AF","8":"AL","10":"AQ","12":"DZ","16":"AS","20":"AD","24":"AO","28":"AG","31":"AZ","32":"AR","36":"AU","40":"AT","44":"BS","48":"BH","50":"BD","51":"AM","52":"BB","56":"BE","60":"BM","64":"BT","68":"BO","70":"BA","72":"BW","74":"BV","76":"BR","84":"BZ","86":"IO","90":"SB","92":"VG","96":"BN","100":"BG","104":"MM","108":"BI","112":"BY","116":"KH","120":"CM","124":"CA","132":"CV","136":"KY","140":"CF","144":"LK","148":"TD","152":"CL","156":"CN","158":"TW","162":"CX","166":"CC","170":"CO","174":"KM","175":"YT","178":"CG","180":"CD","184":"CK","188":"CR","191":"HR","192":"CU","196":"CY","203":"CZ","204":"BJ","208":"DK","212":"DM","214":"DO","218":"EC","222":"SV","226":"GQ","231":"ET","232":"ER","233":"EE","234":"FO","238":"FK","239":"GS","242":"FJ","246":"FI","248":"AX","250":"FR","254":"GF","258":"PF","260":"TF","262":"DJ","266":"GA","268":"GE","270":"GM","275":"PS","276":"DE","288":"GH","292":"GI","296":"KI","300":"GR","304":"GL","308":"GD","312":"GP","316":"GU","320":"GT","324":"GN","328":"GY","332":"HT","334":"HM","336":"VA","340":"HN","344":"HK","348":"HU","352":"IS","356":"IN","360":"ID","364":"IR","368":"IQ","372":"IE","376":"IL","380":"IT","384":"CI","388":"JM","392":"JP","398":"KZ","400":"JO","404":"KE","408":"KP","410":"KR","414":"KW","417":"KG","418":"LA","422":"LB","426":"LS","428":"LV","430":"LR","434":"LY","438":"LI","440":"LT","442":"LU","446":"MO","450":"MG","454":"MW","458":"MY","462":"MV","466":"ML","470":"MT","474":"MQ","478":"MR","480":"MU","484":"MX","492":"MC","496":"MN","498":"MD","499":"ME","500":"MS","504":"MA","508":"MZ","512":"OM","516":"NA","520":"NR","524":"NP","528":"NL","531":"CW","533":"AW","534":"SX","535":"BQ","540":"NC","548":"VU","554":"NZ","558":"NI","562":"NE","566":"NG","570":"NU","574":"NF","578":"NO","580":"MP","581":"UM","583":"FM","584":"MH","585":"PW","586":"PK","591":"PA","598":"PG","600":"PY","604":"PE","608":"PH","612":"PN","616":"PL","620":"PT","624":"GW","626":"TL","630":"PR","634":"QA","638":"RE","642":"RO","643":"RU","646":"RW","652":"BL","654":"SH","659":"KN","660":"AI","662":"LC","663":"MF","666":"PM","670":"VC","674":"SM","678":"ST","682":"SA","686":"SN","688":"RS","690":"SC","694":"SL","702":"SG","703":"SK","704":"VN","705":"SI","706":"SO","710":"ZA","716":"ZW","724":"ES","728":"SS","729":"SD","732":"EH","740":"SR","744":"SJ","748":"SZ","752":"SE","756":"CH","760":"SY","762":"TJ","764":"TH","768":"TG","772":"TK","776":"TO","780":"TT","784":"AE","788":"TN","792":"TR","795":"TM","796":"TC","798":"TV","800":"UG","804":"UA","807":"MK","818":"EG","826":"GB","831":"GG","832":"JE","833":"IM","834":"TZ","840":"US","850":"VI","854":"BF","858":"UY","860":"UZ","862":"VE","876":"WF","882":"WS","887":"YE","894":"ZM"};

type TableData = { columns: string[]; rows: string[][] };

/** Replays post-dump Prisma migrations' data transforms on the parsed dump. */
const upconvertLegacyDump = (tables: Map<string, TableData>) => {
  // 20260714: seat -> flight_passenger, flight.flight_reason -> passenger.
  const seat = tables.get('seat');
  if (seat && !tables.has('flight_passenger')) {
    const flight = tables.get('flight');
    const reasonByFlightId = new Map<string, string>();
    if (flight) {
      const idIdx = flight.columns.indexOf('id');
      const reasonIdx = flight.columns.indexOf('flight_reason');
      if (reasonIdx >= 0) {
        for (const row of flight.rows) {
          reasonByFlightId.set(row[idIdx]!, row[reasonIdx]!);
        }
        // Drop the moved column from flight.
        flight.columns.splice(reasonIdx, 1);
        for (const row of flight.rows) row.splice(reasonIdx, 1);
      }

      // Delete flights without passengers (flights must have >= 1 passenger).
      const flightIdIdx = seat.columns.indexOf('flight_id');
      const flightsWithPassengers = new Set(
        seat.rows.map((row) => row[flightIdIdx]!),
      );
      const before = flight.rows.length;
      flight.rows = flight.rows.filter((row) =>
        flightsWithPassengers.has(row[idIdx]!),
      );
      const removed = before - flight.rows.length;
      if (removed > 0) {
        console.log(`flight: removed ${removed} legacy flight(s) without passengers`);
        const keptIds = new Set(flight.rows.map((row) => row[idIdx]!));
        const cfv = tables.get('custom_field_value');
        if (cfv) {
          const typeIdx = cfv.columns.indexOf('entity_type');
          const entityIdx = cfv.columns.indexOf('entity_id');
          cfv.rows = cfv.rows.filter(
            (row) => row[typeIdx] !== 'flight' || keptIds.has(row[entityIdx]!),
          );
        }
      }
    }

    const seatFlightIdIdx = seat.columns.indexOf('flight_id');
    tables.set('flight_passenger', {
      columns: [...seat.columns, 'flight_reason'],
      rows: seat.rows.map((row) => [
        ...row,
        reasonByFlightId.get(row[seatFlightIdIdx]!) ?? '\\N',
      ]),
    });
    console.log(`flight_passenger: converted from legacy seat table`);
  }

  // 20260426: legacy single-axis user.unit -> granular preference columns.
  const user = tables.get('user');
  if (user) {
    const unitIdx = user.columns.indexOf('unit');
    if (unitIdx >= 0) {
      user.columns.splice(unitIdx, 1, 'distance_unit', 'temperature_unit', 'pressure_unit');
      for (const row of user.rows) {
        const imperial = row[unitIdx] === 'imperial';
        row.splice(
          unitIdx,
          1,
          imperial ? 'mi' : 'km',
          imperial ? 'f' : 'c',
          imperial ? 'inhg' : 'hpa',
        );
      }
      console.log('user: converted legacy unit column to preference columns');
    }
  }

  // 20260713: visited_country numeric codes -> alpha-2.
  const visited = tables.get('visited_country');
  if (visited) {
    const codeIdx = visited.columns.indexOf('code');
    for (const row of visited.rows) {
      const code = row[codeIdx]!;
      if (/^\d+$/.test(code)) {
        const alpha2 = NUMERIC_TO_ALPHA2[code];
        if (!alpha2) throw new Error(`Unknown numeric country code: ${code}`);
        row[codeIdx] = alpha2;
      }
    }
  }
};

const sqlLiteral = (value: string | number | null): string => {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
};

const main = async () => {
  const [dumpPath, outPath] = process.argv.slice(2);
  if (!dumpPath || !outPath) {
    console.error('Usage: bun scripts/pg-to-d1.ts <dump.sql> <out.sql>');
    process.exit(1);
  }

  const dump = await Bun.file(dumpPath).text();
  const lines = dump.split('\n');

  const tables = new Map<string, { columns: string[]; rows: string[][] }>();

  let current: { columns: string[]; rows: string[][] } | null = null;
  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (current) {
      if (line === '\\.') {
        current = null;
        continue;
      }
      current.rows.push(line.split('\t'));
      continue;
    }
    const copyMatch = line.match(/^COPY public\."?([\w]+)"? \(([^)]+)\) FROM stdin;$/);
    if (copyMatch) {
      const columns = copyMatch[2]!
        .split(',')
        .map((c) => c.trim().replaceAll('"', ''));
      current = { columns, rows: [] };
      tables.set(copyMatch[1]!, current);
    }
  }

  upconvertLegacyDump(tables);

  const out: string[] = [
    '-- Generated by scripts/pg-to-d1.ts — data import for D1.',
    'PRAGMA defer_foreign_keys = on;',
  ];
  const tempPasswords: Array<{ username: string; password: string }> = [];
  const oversized: string[] = [];

  for (const table of TABLE_ORDER) {
    const data = tables.get(table);
    if (!data || data.rows.length === 0) {
      console.log(`${table}: no rows`);
      continue;
    }

    const booleanCols = BOOLEAN_COLUMNS[table] ?? new Set<string>();
    const timestampCols = TIMESTAMP_COLUMNS[table] ?? new Set<string>();
    const usernameIdx = data.columns.indexOf('username');
    const passwordIdx = table === 'user' ? data.columns.indexOf('password') : -1;

    const valueTuples: string[] = [];
    for (const row of data.rows) {
      if (row.length !== data.columns.length) {
        throw new Error(
          `${table}: row has ${row.length} fields, expected ${data.columns.length}`,
        );
      }
      const literals: string[] = [];
      for (let i = 0; i < row.length; i++) {
        const column = data.columns[i]!;
        let value = unescapeCopyValue(row[i]!);
        if (value === null) {
          literals.push('NULL');
          continue;
        }
        if (booleanCols.has(column)) {
          literals.push(value === 't' ? '1' : '0');
          continue;
        }
        if (timestampCols.has(column)) {
          literals.push(sqlLiteral(toIsoTimestamp(value)));
          continue;
        }
        if (i === passwordIdx && value.startsWith('$argon2')) {
          const temp = randomPassword();
          value = await hashPassword(temp);
          const username =
            usernameIdx >= 0 ? unescapeCopyValue(row[usernameIdx]!) : null;
          tempPasswords.push({ username: username ?? '<unknown>', password: temp });
        }
        literals.push(sqlLiteral(value));
      }
      valueTuples.push(`(${literals.join(',')})`);
    }

    const prefix = `INSERT INTO "${table}" (${data.columns
      .map((c) => `"${c}"`)
      .join(',')}) VALUES\n`;

    let batch: string[] = [];
    let batchBytes = 0;
    const flush = () => {
      if (!batch.length) return;
      const statement = prefix + batch.join(',\n') + ';';
      if (Buffer.byteLength(statement, 'utf8') > 100_000) {
        oversized.push(
          `${table}: statement with ${batch.length} row(s) is ${Buffer.byteLength(statement, 'utf8')} bytes (>100KB D1 limit)`,
        );
      }
      out.push(statement);
      batch = [];
      batchBytes = 0;
    };

    for (const tuple of valueTuples) {
      const tupleBytes = Buffer.byteLength(tuple, 'utf8');
      if (
        batch.length > 0 &&
        (batch.length >= MAX_ROWS_PER_INSERT ||
          batchBytes + tupleBytes > MAX_STATEMENT_BYTES)
      ) {
        flush();
      }
      batch.push(tuple);
      batchBytes += tupleBytes;
    }
    flush();

    console.log(`${table}: ${data.rows.length} rows`);
  }

  await Bun.write(outPath, out.join('\n\n') + '\n');
  console.log(`\nWrote ${outPath}`);

  if (tempPasswords.length) {
    console.log(
      '\nPasswords were re-hashed (argon2 cannot be verified on Workers).',
    );
    console.log('Temporary passwords — change them after first login:');
    for (const { username, password } of tempPasswords) {
      console.log(`  ${username}: ${password}`);
    }
  }
  if (oversized.length) {
    console.warn('\nWARNING: statements exceeding the 100KB D1 limit:');
    for (const warning of oversized) console.warn(`  ${warning}`);
  }
};

await main();
