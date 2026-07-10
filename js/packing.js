/*
  Michify - TCG Binder Designer
  packing.js - shelf bin packing of print pieces onto paper sheets.
  Pure functions, no DOM access.
  Copyright (c) 2026 Risto Ruuskanen
  Licensed under the MIT License
*/

// pieces: [{ widthMm, heightMm, ... }], paper sizes and gap in mm.
// Returns { sheets: [{ shelves, placements }], tooLarge: piece | null }.
// Each placement is { piece, orient: { w, h, rotated }, x, y, w, h }.
export function packPieces(pieces, paperW, paperH, gapMm) {
  const sheets = [];
  const sortedPieces = pieces.slice().sort((a, b) => b.heightMm - a.heightMm);
  for (const piece of sortedPieces) {
    let placed = false;
    const orientations = [
      { w: piece.widthMm, h: piece.heightMm, rotated: false },
      { w: piece.heightMm, h: piece.widthMm, rotated: true }
    ];
    for (const sheet of sheets) {
      for (const orient of orientations) {
        if (tryPlaceOnSheet(sheet, piece, orient, paperW, paperH, gapMm)) {
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      const newSheet = { shelves: [], placements: [] };
      for (const orient of orientations) {
        if (tryPlaceOnSheet(newSheet, piece, orient, paperW, paperH, gapMm)) {
          placed = true;
          break;
        }
      }
      if (placed) {
        sheets.push(newSheet);
      } else {
        return { sheets, tooLarge: piece };
      }
    }
  }
  return { sheets, tooLarge: null };
}

function tryPlaceOnSheet(sheet, piece, orient, paperW, paperH, gapMm) {
  const w = orient.w;
  const h = orient.h;
  if (w > paperW || h > paperH) return false;
  for (const shelf of sheet.shelves) {
    if (h > shelf.height) continue;
    let nextX = shelf.usedWidth;
    if (shelf.usedWidth > 0) nextX += gapMm;
    if (nextX + w <= paperW) {
      sheet.placements.push({ piece, orient, x: nextX, y: shelf.y, w, h });
      shelf.usedWidth = nextX + w;
      return true;
    }
  }
  let nextY = 0;
  if (sheet.shelves.length > 0) {
    const lastShelf = sheet.shelves[sheet.shelves.length - 1];
    nextY = lastShelf.y + lastShelf.height + gapMm;
  }
  if (nextY + h <= paperH) {
    sheet.shelves.push({ y: nextY, height: h, usedWidth: w });
    sheet.placements.push({ piece, orient, x: 0, y: nextY, w, h });
    return true;
  }
  return false;
}
