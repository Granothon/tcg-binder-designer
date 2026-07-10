/*
  Michify - TCG Binder Designer
  geometry.js - pure geometry: slot measurements, rotation-aware image
  footprint math, cover-fit and clamping, and seam-based piece grouping.
  No DOM access, so everything here is unit-testable in Node.
  Copyright (c) 2026 Risto Ruuskanen
  Licensed under the MIT License
*/

export function slotSizeMm(page, sw, sh) {
  return {
    w: sw * page.pocketW + (sw - 1) * page.seamH,
    h: sh * page.pocketH + (sh - 1) * page.seamV
  };
}

export function findSlotAt(page, row, col) {
  for (const key in page.images) {
    const img = page.images[key];
    const [r, c] = key.split(',').map(Number);
    const w = img.slotW || 1;
    const h = img.slotH || 1;
    if (row >= r && row < r + h && col >= c && col < c + w) {
      return { key, row: r, col: c, image: img };
    }
  }
  return null;
}

// ignore: a slot key, an array of slot keys, or null.
export function isAreaFree(page, row, col, w, h, ignore) {
  if (row + h > page.rows || col + w > page.cols) return false;
  if (row < 0 || col < 0) return false;
  const ignoreKeys = ignore == null ? [] : (Array.isArray(ignore) ? ignore : [ignore]);
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) {
      const slot = findSlotAt(page, r, c);
      if (slot && !ignoreKeys.includes(slot.key)) return false;
    }
  }
  return true;
}

export function normalizeRotation(rotate) {
  return ((Math.round(rotate || 0) % 360) + 360) % 360;
}

// The image "footprint" is the axis-aligned box the rotated image occupies
// on the page. img.widthMm / xMm / yMm always describe the footprint, so
// offset and clamp math stays rotation-independent:
//   fw = footprint width (mm), fh = footprint height (mm)
//   effRatio = fw / fh (natural ratio, inverted for 90/270)
export function imageFootprint(img) {
  const ratio = img._naturalRatio || 1;
  const rot = normalizeRotation(img.rotate);
  const swapped = rot === 90 || rot === 270;
  const effRatio = swapped ? 1 / ratio : ratio;
  const fw = img.widthMm;
  const fh = fw / effRatio;
  return { fw, fh, rot, ratio, effRatio, swapped };
}

// CSS placement for the <img> element so that, after rotating the element
// around its own top-left corner, the visible result lands exactly on the
// footprint at (img.xMm - offsetX, img.yMm - offsetY). The element keeps its
// natural orientation box (width elWidthMm, height elWidthMm/ratio), which
// the corner rotation maps onto the footprint:
//   90deg  shifts the box left by its height  -> compensate left by +fw
//   180deg shifts left and up by the full box -> compensate by +fw, +fh
//   270deg shifts up by the element width     -> compensate top by +fh
export function imageElementPlacement(img, offsetXmm, offsetYmm) {
  const { fw, fh, rot, ratio, swapped } = imageFootprint(img);
  const elWidthMm = swapped ? fw * ratio : fw;
  const x = img.xMm - offsetXmm;
  const y = img.yMm - offsetYmm;
  let leftMm = x;
  let topMm = y;
  if (rot === 90) { leftMm = x + fw; }
  else if (rot === 180) { leftMm = x + fw; topMm = y + fh; }
  else if (rot === 270) { topMm = y + fh; }
  return { elWidthMm, leftMm, topMm, rotate: rot };
}

// Keep the footprint covering the slot: enforce a minimum width and clamp
// the offsets so no slot area is left uncovered.
export function clampImage(page, img) {
  if (!isFinite(img.xMm)) img.xMm = 0;
  if (!isFinite(img.yMm)) img.yMm = 0;
  const sw = img.slotW || 1;
  const sh = img.slotH || 1;
  const slot = slotSizeMm(page, sw, sh);
  const { effRatio } = imageFootprint(img);
  const minWidth = Math.max(slot.w, slot.h * effRatio);
  if (!(img.widthMm >= minWidth)) img.widthMm = minWidth;
  const fw = img.widthMm;
  const fh = fw / effRatio;
  if (fw <= slot.w) img.xMm = 0;
  else img.xMm = Math.min(0, Math.max(slot.w - fw, img.xMm));
  if (fh <= slot.h) img.yMm = 0;
  else img.yMm = Math.min(0, Math.max(slot.h - fh, img.yMm));
}

// Center-cover fit of the image footprint inside its slot.
export function coverFit(page, img) {
  const slot = slotSizeMm(page, img.slotW || 1, img.slotH || 1);
  const { effRatio } = imageFootprint(img);
  const slotRatio = slot.w / slot.h;
  if (effRatio > slotRatio) {
    img.widthMm = slot.h * effRatio;
    img.xMm = -(img.widthMm - slot.w) / 2;
    img.yMm = 0;
  } else {
    img.widthMm = slot.w;
    img.xMm = 0;
    img.yMm = -(slot.w / effRatio - slot.h) / 2;
  }
  clampImage(page, img);
}

// Split a slot into printable pieces along CUT seams; continuous seams keep
// neighboring pockets in the same piece. Shared by the preview corner
// overlays and the print pipeline.
export function groupSlotPieces(page, key, img) {
  const [srow, scol] = key.split(',').map(Number);
  const sw = img.slotW || 1;
  const sh = img.slotH || 1;
  const colGroups = [];
  let group = [scol];
  for (let c = scol; c < scol + sw - 1; c++) {
    if (page.seamsH[c] === 'cut') { colGroups.push(group); group = [c + 1]; }
    else group.push(c + 1);
  }
  colGroups.push(group);
  const rowGroups = [];
  group = [srow];
  for (let r = srow; r < srow + sh - 1; r++) {
    if (page.seamsV[r] === 'cut') { rowGroups.push(group); group = [r + 1]; }
    else group.push(r + 1);
  }
  rowGroups.push(group);
  const pieces = [];
  for (const rg of rowGroups) {
    for (const cg of colGroups) {
      pieces.push({
        firstRow: rg[0], lastRow: rg[rg.length - 1],
        firstCol: cg[0], lastCol: cg[cg.length - 1]
      });
    }
  }
  return pieces;
}
