import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slotSizeMm, findSlotAt, isAreaFree,
  imageFootprint, imageElementPlacement, clampImage, coverFit, groupSlotPieces
} from '../js/geometry.js';

function makePage(overrides = {}) {
  return Object.assign({
    rows: 3, cols: 3,
    pocketW: 68, pocketH: 93,
    seamH: 2, seamV: 2,
    seamsH: ['cut', 'cut'],
    seamsV: ['cut', 'cut'],
    images: {},
    emptyPockets: []
  }, overrides);
}

// A "landscape" test image: natural 200x100 px, ratio 2.
function makeImage(overrides = {}) {
  return Object.assign({
    src: 'x', widthMm: 100, xMm: 0, yMm: 0, rotate: 0,
    slotW: 1, slotH: 1, _naturalRatio: 2
  }, overrides);
}

test('slotSizeMm includes seams between pockets', () => {
  const p = makePage();
  assert.deepEqual(slotSizeMm(p, 1, 1), { w: 68, h: 93 });
  assert.deepEqual(slotSizeMm(p, 3, 2), { w: 3 * 68 + 2 * 2, h: 2 * 93 + 2 });
});

test('findSlotAt resolves multi-pocket slots to their origin', () => {
  const p = makePage();
  p.images['0,1'] = makeImage({ slotW: 2, slotH: 2 });
  const hit = findSlotAt(p, 1, 2);
  assert.equal(hit.key, '0,1');
  assert.equal(hit.row, 0);
  assert.equal(hit.col, 1);
  assert.equal(findSlotAt(p, 2, 0), null);
});

test('isAreaFree respects bounds, occupancy and ignore keys', () => {
  const p = makePage();
  p.images['0,0'] = makeImage({ slotW: 2, slotH: 1 });
  assert.equal(isAreaFree(p, 0, 0, 1, 1, null), false);
  assert.equal(isAreaFree(p, 0, 0, 1, 1, '0,0'), true);
  assert.equal(isAreaFree(p, 0, 0, 1, 1, ['0,0']), true);
  assert.equal(isAreaFree(p, 2, 2, 2, 1, null), false); // out of bounds
  assert.equal(isAreaFree(p, -1, 0, 1, 1, null), false);
  assert.equal(isAreaFree(p, 1, 0, 3, 2, null), true);
});

test('imageFootprint swaps the effective ratio at 90/270 degrees', () => {
  const img = makeImage();
  assert.deepEqual(
    (({ fw, fh, effRatio, swapped }) => ({ fw, fh, effRatio, swapped }))(imageFootprint(img)),
    { fw: 100, fh: 50, effRatio: 2, swapped: false }
  );
  img.rotate = 90;
  const f90 = imageFootprint(img);
  assert.equal(f90.fh, 200);
  assert.equal(f90.effRatio, 0.5);
  assert.equal(f90.swapped, true);
  img.rotate = 180;
  assert.equal(imageFootprint(img).fh, 50);
  img.rotate = 270;
  assert.equal(imageFootprint(img).fh, 200);
});

test('imageElementPlacement compensates for corner rotation at every angle', () => {
  const img = makeImage({ xMm: -10, yMm: -5 });
  // rotate 0: element box == footprint
  assert.deepEqual(imageElementPlacement(img, 0, 0), {
    elWidthMm: 100, leftMm: -10, topMm: -5, rotate: 0
  });
  // rotate 90: element is natural-oriented (width fw*ratio), shifted right by fw
  img.rotate = 90;
  assert.deepEqual(imageElementPlacement(img, 0, 0), {
    elWidthMm: 200, leftMm: 90, topMm: -5, rotate: 90
  });
  // rotate 180: shifted right by fw and down by fh
  img.rotate = 180;
  assert.deepEqual(imageElementPlacement(img, 0, 0), {
    elWidthMm: 100, leftMm: 90, topMm: 45, rotate: 180
  });
  // rotate 270: shifted down by fh
  img.rotate = 270;
  assert.deepEqual(imageElementPlacement(img, 0, 0), {
    elWidthMm: 200, leftMm: -10, topMm: 195, rotate: 270
  });
  // part offsets subtract before compensation
  img.rotate = 0;
  const pl = imageElementPlacement(img, 70, 95);
  assert.equal(pl.leftMm, -80);
  assert.equal(pl.topMm, -100);
});

test('clampImage enforces cover for the rotated footprint', () => {
  const p = makePage();
  const img = makeImage({ widthMm: 10 }); // far too small
  clampImage(p, img);
  // ratio 2 in a 68x93 slot: min width is 93*2 = 186
  assert.equal(img.widthMm, 186);
  assert.equal(img.xMm <= 0, true);

  const img90 = makeImage({ widthMm: 10, rotate: 90 });
  clampImage(p, img90);
  // rotated: effRatio 0.5, min width is max(68, 93*0.5) = 68
  assert.equal(img90.widthMm, 68);
  // footprint height 136 > 93, so yMm stays within [-43, 0]
  img90.yMm = -999;
  clampImage(p, img90);
  assert.equal(img90.yMm, 93 - 136);
  img90.yMm = 5;
  clampImage(p, img90);
  assert.equal(img90.yMm, 0);
});

test('clampImage recovers from non-finite values', () => {
  const p = makePage();
  const img = makeImage({ widthMm: NaN, xMm: NaN, yMm: Infinity });
  clampImage(p, img);
  assert.equal(isFinite(img.widthMm), true);
  assert.equal(isFinite(img.xMm), true);
  assert.equal(isFinite(img.yMm), true);
});

test('coverFit centers the footprint inside the slot', () => {
  const p = makePage();
  const img = makeImage();
  coverFit(p, img);
  // effRatio 2 > slot ratio: width = 93*2 = 186, centered horizontally
  assert.equal(img.widthMm, 186);
  assert.equal(img.xMm, -(186 - 68) / 2);
  assert.equal(img.yMm, 0);

  const img90 = makeImage({ rotate: 90 });
  coverFit(p, img90);
  // effRatio 0.5 < slot ratio: width = slot width, centered vertically
  assert.equal(img90.widthMm, 68);
  assert.equal(img90.yMm, -(68 / 0.5 - 93) / 2);
});

test('groupSlotPieces splits along cut seams only', () => {
  const p = makePage({ seamsH: ['continuous', 'cut'], seamsV: ['cut', 'continuous'] });
  const img = makeImage({ slotW: 3, slotH: 3 });
  p.images['0,0'] = img;
  const pieces = groupSlotPieces(p, '0,0', img);
  assert.equal(pieces.length, 4);
  assert.deepEqual(pieces[0], { firstRow: 0, lastRow: 0, firstCol: 0, lastCol: 1 });
  assert.deepEqual(pieces[1], { firstRow: 0, lastRow: 0, firstCol: 2, lastCol: 2 });
  assert.deepEqual(pieces[2], { firstRow: 1, lastRow: 2, firstCol: 0, lastCol: 1 });
  assert.deepEqual(pieces[3], { firstRow: 1, lastRow: 2, firstCol: 2, lastCol: 2 });
});

test('groupSlotPieces keeps a fully continuous slot as one piece', () => {
  const p = makePage({ seamsH: ['continuous', 'continuous'], seamsV: ['continuous', 'continuous'] });
  const img = makeImage({ slotW: 3, slotH: 3 });
  p.images['0,0'] = img;
  const pieces = groupSlotPieces(p, '0,0', img);
  assert.equal(pieces.length, 1);
  assert.deepEqual(pieces[0], { firstRow: 0, lastRow: 2, firstCol: 0, lastCol: 2 });
});
