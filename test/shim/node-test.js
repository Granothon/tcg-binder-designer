/*
  Minimal browser shim for 'node:test' so the unit tests in this folder can
  also run in a browser via test/browser.html (see the import map there).
*/

export const results = [];

export default async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, error: String((err && err.stack) || err) });
  }
}
