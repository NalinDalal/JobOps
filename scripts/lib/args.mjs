/**
 * lib/args.mjs — CLI argument helpers
 */

const args = process.argv.slice(2);

export function argVal(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}

export function argFlag(name) {
  return args.includes(`--${name}`);
}
