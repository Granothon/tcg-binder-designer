import test from 'node:test';
import assert from 'node:assert/strict';
import { packPieces } from '../js/packing.js';

function piece(widthMm, heightMm, label = '') {
  return { widthMm, heightMm, label };
}

test('packs two pockets side by side on one sheet with the gap', () => {
  const result = packPieces([piece(68, 93), piece(68, 93)], 200, 287, 2);
  assert.equal(result.tooLarge, null);
  assert.equal(result.sheets.length, 1);
  const placements = result.sheets[0].placements;
  assert.equal(placements.length, 2);
  assert.equal(placements[0].x, 0);
  assert.equal(placements[0].y, 0);
  assert.equal(placements[1].x, 68 + 2);
  assert.equal(placements[1].y, 0);
  assert.equal(placements.every(pl => !pl.orient.rotated), true);
});

test('opens a new shelf below when the row is full', () => {
  // Three 90mm-wide pieces on a 200mm-wide sheet: 90 + 2 + 90 = 182 fits,
  // the third goes to a new shelf at y = 93 + 2.
  const result = packPieces([piece(90, 93), piece(90, 93), piece(90, 93)], 200, 287, 2);
  assert.equal(result.sheets.length, 1);
  const third = result.sheets[0].placements[2];
  assert.equal(third.x, 0);
  assert.equal(third.y, 95);
});

test('rotates a piece when it only fits sideways', () => {
  const result = packPieces([piece(250, 90)], 200, 287, 2);
  assert.equal(result.tooLarge, null);
  const pl = result.sheets[0].placements[0];
  assert.equal(pl.orient.rotated, true);
  assert.equal(pl.w, 90);
  assert.equal(pl.h, 250);
});

test('starts a new sheet when the first is full', () => {
  // 287 usable height: two 140-tall shelves + gap = 282 fit, third does not.
  const pieces = [piece(190, 140), piece(190, 140), piece(190, 140)];
  const result = packPieces(pieces, 200, 287, 2);
  assert.equal(result.tooLarge, null);
  assert.equal(result.sheets.length, 2);
});

test('reports a piece too large for the paper', () => {
  const result = packPieces([piece(300, 300, 'huge')], 200, 287, 2);
  assert.notEqual(result.tooLarge, null);
  assert.equal(result.tooLarge.label, 'huge');
});
