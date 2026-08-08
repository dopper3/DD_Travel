/**
 * Post-build patch for the Cloudflare Workers target.
 *
 * Rolldown emits `createRequire(import.meta.url)` when a dependency contains
 * a runtime `require()` it cannot resolve (svelte-motion's optional
 * `require('@emotion/is-prop-valid')`). In workerd, `import.meta.url` is
 * undefined and `createRequire(undefined)` throws during module init, killing
 * the whole Worker. Substitute a valid file URL: the helper then constructs
 * fine, and the actual require() call throws lazily inside svelte-motion's
 * try/catch, which is the intended optional-dependency fallback.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVER_DIR = '.svelte-kit/output/server';
const NEEDLE = 'createRequire(import.meta.url)';
const REPLACEMENT = 'createRequire("file:///_worker.js")';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return name.endsWith('.js') ? [path] : [];
  });

let patched = 0;
for (const file of walk(SERVER_DIR)) {
  const source = readFileSync(file, 'utf8');
  if (source.includes(NEEDLE)) {
    writeFileSync(file, source.replaceAll(NEEDLE, REPLACEMENT));
    patched++;
    console.log(`patched ${file}`);
  }
}
console.log(`patch-cloudflare-build: ${patched} file(s) patched`);
