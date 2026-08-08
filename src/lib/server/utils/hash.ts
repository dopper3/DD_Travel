import { createHash } from 'node:crypto';

/**
 * Password hashing built on WebCrypto PBKDF2 so it runs on Cloudflare Workers
 * (the upstream @node-rs/argon2 native module does not).
 *
 * Hash format: `pbkdf2$<iterations>$<salt b64>$<derived key b64>`
 *
 * Legacy argon2 hashes (from the original Node deployment) cannot be verified
 * on Workers; those users need a password reset (verify returns false with a
 * console warning).
 */
// Cloudflare Workers rejects PBKDF2 iteration counts above 100,000.
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

const b64encode = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

const b64decode = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

const deriveKey = async (
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    keyMaterial,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
};

export const hashArgon2 = async (string: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(normalize(string), salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64encode(salt)}$${b64encode(key)}`;
};

export const verifyArgon2 = async (
  hashedString: string,
  string: string,
): Promise<boolean> => {
  if (hashedString.startsWith('$argon2')) {
    console.warn(
      'Legacy argon2 password hash encountered; it cannot be verified on this runtime. The user needs a password reset.',
    );
    return false;
  }

  const parts = hashedString.split('$');
  const [scheme, iterationsPart, saltPart, keyPart] = parts;
  if (
    parts.length !== 4 ||
    scheme !== 'pbkdf2' ||
    iterationsPart === undefined ||
    saltPart === undefined ||
    keyPart === undefined
  ) {
    return false;
  }

  const iterations = Number(iterationsPart);
  if (!Number.isInteger(iterations) || iterations < 1) {
    return false;
  }

  const salt = b64decode(saltPart);
  const expected = b64decode(keyPart);
  let actual: Uint8Array;
  try {
    actual = await deriveKey(normalize(string), salt, iterations);
  } catch (err) {
    // e.g. Workers rejects iteration counts above 100,000.
    console.warn('Password hash could not be verified on this runtime:', err);
    return false;
  }

  if (expected.length !== actual.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= (expected[i] ?? 0) ^ (actual[i] ?? 0);
  }
  return diff === 0;
};

export const hashSha256 = (string: string): string => {
  return createHash('sha256').update(normalize(string)).digest('base64');
};

const normalize = (string: string): string => {
  return string.normalize('NFKC');
};
