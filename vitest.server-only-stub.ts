/**
 * Test-only stand-in for the `server-only` package.
 *
 * `server-only` throws on import so a server module can never reach a client
 * bundle. Vitest runs in a node environment, which is not a client bundle, so
 * the guard has nothing to protect and only prevents server modules from being
 * unit-tested at all. Next.js still enforces the real thing at build time --
 * this alias is scoped to vitest.config.ts and changes nothing that ships.
 */
export {};
