/*
  Michify - TCG Binder Designer
  state.js - project state, undo/redo history, dirty tracking and the
  save-file format (serialize + normalize with backwards compatibility).
  No DOM access.
  Copyright (c) 2026 Risto Ruuskanen
  Licensed under the MIT License
*/

import { slotSizeMm } from './geometry.js';

// Coerce an untrusted value to an integer within [min, max]; non-numeric
// input falls back to min. Used when normalizing loaded project data.
function clampInt(v, min, max) {
  const n = parseInt(v);
  if (!isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export const HISTORY_LIMIT = 50;
// Consecutive pushes with the same tag inside this window collapse into one
// undo step (wheel zoom bursts, arrow-key nudges, drag pans).
export const HISTORY_COALESCE_MS = 800;

export const state = {
  pages: [createEmptyPage()],
  currentPage: 0,
  selectedSlot: null,
  rangeSelection: null,
  viewScale: 3,
  clipboard: null,
  cornerMode: 'none',   // 'none' | 'outer' | 'every'
  cornerRadius: 3.18,   // mm
  imageMaxDim: 3000     // max pixels on longest side, 0 = original
};

export function createEmptyPage() {
  return {
    rows: 3,
    cols: 3,
    pocketW: 68,
    pocketH: 93,
    seamH: 2,
    seamV: 2,
    seamsH: ['cut', 'continuous'],
    seamsV: ['cut', 'cut'],
    images: {},
    emptyPockets: [] // "row,col" strings for intentionally empty pockets
  };
}

export function currentPage() {
  return state.pages[state.currentPage];
}

// ============================================================
// UNDO / REDO
// Snapshots share image src strings by reference (strings are
// immutable), so each snapshot costs only the object shells.
// ============================================================
let undoStack = [];
let redoStack = [];
let lastTag = null;
let lastTagTime = 0;

function clonePage(page) {
  const images = {};
  for (const key in page.images) {
    images[key] = Object.assign({}, page.images[key]);
  }
  return Object.assign({}, page, {
    seamsH: page.seamsH.slice(),
    seamsV: page.seamsV.slice(),
    emptyPockets: (page.emptyPockets || []).slice(),
    images
  });
}

function snapshot() {
  return { pages: state.pages.map(clonePage), currentPage: state.currentPage };
}

function applySnapshot(s) {
  state.pages = s.pages;
  state.currentPage = Math.min(s.currentPage, s.pages.length - 1);
  state.selectedSlot = null;
  state.rangeSelection = null;
}

// Call BEFORE mutating pages. Pass a tag for high-frequency operations that
// should coalesce into a single undo step.
export function pushHistory(tag) {
  const now = Date.now();
  if (tag && tag === lastTag && now - lastTagTime < HISTORY_COALESCE_MS) {
    lastTagTime = now;
    markDirty();
    return;
  }
  undoStack.push(snapshot());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  lastTag = tag || null;
  lastTagTime = now;
  markDirty();
}

export function undo() {
  if (undoStack.length === 0) return false;
  redoStack.push(snapshot());
  applySnapshot(undoStack.pop());
  lastTag = null;
  markDirty();
  return true;
}

export function redo() {
  if (redoStack.length === 0) return false;
  undoStack.push(snapshot());
  applySnapshot(redoStack.pop());
  lastTag = null;
  markDirty();
  return true;
}

export function resetHistory() {
  undoStack = [];
  redoStack = [];
  lastTag = null;
}

export function historyDepth() {
  return { undo: undoStack.length, redo: redoStack.length };
}

// ============================================================
// DIRTY TRACKING (autosave + beforeunload)
// ============================================================
let dirty = false;
let dirtyListener = null;

export function onDirty(fn) { dirtyListener = fn; }
export function markDirty() {
  dirty = true;
  if (dirtyListener) dirtyListener();
}
export function clearDirty() { dirty = false; }
export function isDirty() { return dirty; }

// ============================================================
// SAVE FORMAT
// ============================================================
export function serializeProject() {
  return {
    app: 'michify',
    version: 2,
    savedAt: new Date().toISOString(),
    pages: state.pages,
    currentPage: state.currentPage,
    cornerMode: state.cornerMode,
    cornerRadius: state.cornerRadius,
    imageMaxDim: state.imageMaxDim
  };
}

// Accepts both the current format and older saves (full app state, or the
// legacy per-image { scale, x, y } crop format). Throws on invalid input.
export function normalizeProjectData(data) {
  if (!data || !Array.isArray(data.pages) || data.pages.length === 0) {
    throw new Error('Invalid file');
  }
  const legacyViewScale = data.viewScale || 3;
  data.pages.forEach(page => {
    page.rows = parseInt(page.rows) || 3;
    page.cols = parseInt(page.cols) || 3;
    page.pocketW = parseFloat(page.pocketW) || 68;
    page.pocketH = parseFloat(page.pocketH) || 93;
    page.seamH = isFinite(parseFloat(page.seamH)) ? parseFloat(page.seamH) : 2;
    page.seamV = isFinite(parseFloat(page.seamV)) ? parseFloat(page.seamV) : 2;
    if (!Array.isArray(page.seamsH)) page.seamsH = [];
    if (!Array.isArray(page.seamsV)) page.seamsV = [];
    while (page.seamsH.length < page.cols - 1) page.seamsH.push('cut');
    while (page.seamsH.length > page.cols - 1) page.seamsH.pop();
    while (page.seamsV.length < page.rows - 1) page.seamsV.push('cut');
    while (page.seamsV.length > page.rows - 1) page.seamsV.pop();
    if (!page.emptyPockets) page.emptyPockets = [];
    if (!page.images) page.images = {};
    for (const key in page.images) {
      const img = page.images[key];
      // Coerce slot spans to positive integers within the grid. Loaded data
      // is untrusted: these values flow into innerHTML (the properties panel),
      // so a non-numeric string here would be an injection vector.
      img.slotW = clampInt(img.slotW, 1, Math.max(1, page.cols));
      img.slotH = clampInt(img.slotH, 1, Math.max(1, page.rows));
      if (img.widthMm === undefined && img.scale !== undefined) {
        const slot = slotSizeMm(page, img.slotW, img.slotH);
        img.widthMm = slot.w * img.scale;
        img.xMm = (img.x || 0) / legacyViewScale;
        img.yMm = (img.y || 0) / legacyViewScale;
        delete img.scale;
        delete img.x;
        delete img.y;
      }
      if (!isFinite(img.widthMm)) img.widthMm = 100;
      if (!isFinite(img.xMm)) img.xMm = 0;
      if (!isFinite(img.yMm)) img.yMm = 0;
      img.rotate = parseInt(img.rotate) || 0;
      delete img._pxMeasureInProgress;
    }
  });
  const cr = parseFloat(data.cornerRadius);
  const im = parseInt(data.imageMaxDim);
  return {
    pages: data.pages,
    currentPage: Math.min(parseInt(data.currentPage) || 0, data.pages.length - 1),
    // Whitelist / coerce these too: cornerRadius reaches innerHTML (print
    // dialog) and cornerMode gates it, so untrusted values must be sanitized.
    cornerMode: ['none', 'outer', 'every'].includes(data.cornerMode) ? data.cornerMode : 'none',
    cornerRadius: isFinite(cr) ? Math.min(20, Math.max(0.1, cr)) : 3.18,
    imageMaxDim: isFinite(im) && im >= 0 ? im : 3000
  };
}

export function projectHasContent(data) {
  if (!data || !Array.isArray(data.pages)) return false;
  if (data.pages.length > 1) return true;
  return data.pages.some(pg =>
    Object.keys(pg.images || {}).length > 0 || (pg.emptyPockets || []).length > 0
  );
}
