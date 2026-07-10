/*
  Minimal browser shim for 'node:assert/strict' covering the assertions the
  test files use: equal, notEqual, deepEqual, throws.
*/

function fail(msg) {
  throw new Error(msg);
}

function show(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

function deep(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deep(a[k], b[k]));
}

export function equal(a, b, msg) {
  if (a !== b) fail(msg || 'equal: ' + show(a) + ' !== ' + show(b));
}

export function notEqual(a, b, msg) {
  if (a === b) fail(msg || 'notEqual: both were ' + show(a));
}

export function deepEqual(a, b, msg) {
  if (!deep(a, b)) fail(msg || 'deepEqual: ' + show(a) + ' != ' + show(b));
}

export function throws(fn, msg) {
  try {
    fn();
  } catch {
    return;
  }
  fail(msg || 'expected function to throw');
}

export default { equal, notEqual, deepEqual, throws };
