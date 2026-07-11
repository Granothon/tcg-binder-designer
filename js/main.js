/*
  Michify - TCG Binder Designer
  main.js - browser entry point: rendering, UI events, printing, autosave.
  Copyright (c) 2026 Risto Ruuskanen
  Licensed under the MIT License
*/

import {
  state, createEmptyPage, currentPage,
  pushHistory, undo, redo,
  markDirty, clearDirty, isDirty, onDirty,
  serializeProject, normalizeProjectData, projectHasContent
} from './state.js';
import {
  slotSizeMm, findSlotAt, isAreaFree,
  imageFootprint, imageElementPlacement, clampImage, coverFit, groupSlotPieces
} from './geometry.js';
import { packPieces } from './packing.js';
import { saveAutosave, loadAutosave, clearAutosave } from './storage.js';

const CROP_CLIPBOARD_MARKER = 'michify-crop';

let rangeSelecting = null;
let dragging = null;
let movingImage = null; // { fromKey, fromRow, fromCol, startX, startY } for cross-slot image drag

function mmToPx(mm) { return mm * state.viewScale; }

function pocketPos(row, col) {
  const p = currentPage();
  const s = state.viewScale;
  return {
    x: col * (p.pocketW + p.seamH) * s,
    y: row * (p.pocketH + p.seamV) * s,
    w: p.pocketW * s,
    h: p.pocketH * s
  };
}

// Read a numeric input; on empty/invalid input fall back instead of NaN,
// and clamp to the input's own min/max.
function numInput(id, fallback) {
  const el = document.getElementById(id);
  let v = parseFloat(el.value);
  if (!isFinite(v)) return fallback;
  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  if (isFinite(min)) v = Math.max(min, v);
  if (isFinite(max)) v = Math.min(max, v);
  return v;
}

// ============================================================
// SLOT IMAGE ELEMENTS
// Each preview <img> carries its slot key and per-part offset so
// drags and zooms can reposition it in place without rebuilding
// the whole canvas.
// ============================================================
function createSlotImage(imgData, slotKey, offsetXmm, offsetYmm) {
  const el = document.createElement('img');
  el.src = imgData.src;
  el.dataset.slotKey = slotKey;
  el.dataset.offx = offsetXmm;
  el.dataset.offy = offsetYmm;
  applyImagePlacement(el, imgData);
  return el;
}

function applyImagePlacement(el, imgData) {
  const pl = imageElementPlacement(imgData, parseFloat(el.dataset.offx), parseFloat(el.dataset.offy));
  el.style.width = mmToPx(pl.elWidthMm) + 'px';
  el.style.height = 'auto';
  el.style.left = mmToPx(pl.leftMm) + 'px';
  el.style.top = mmToPx(pl.topMm) + 'px';
  el.style.transform = 'rotate(' + pl.rotate + 'deg)';
  el.style.transformOrigin = 'top left';
}

function refreshSlotImages(key) {
  const img = currentPage().images[key];
  if (!img) return;
  document.querySelectorAll('img[data-slot-key]').forEach(el => {
    if (el.dataset.slotKey === key) applyImagePlacement(el, img);
  });
}

// ============================================================
// CORNER LOGIC
// ============================================================
function updateCorners() {
  state.cornerMode = document.getElementById('corner-mode').value;
  state.cornerRadius = numInput('corner-radius', state.cornerRadius);
  const radiusField = document.getElementById('corner-radius-field');
  if (state.cornerMode === 'none') {
    radiusField.classList.add('hidden');
  } else {
    radiusField.classList.remove('hidden');
  }
  markDirty();
  renderBinder();
}

function renderCornerOverlays(canvas) {
  if (state.cornerMode === 'none') return;
  const page = currentPage();
  const radiusPx = mmToPx(state.cornerRadius);
  if (state.cornerMode === 'every') {
    for (const key in page.images) {
      const [srow, scol] = key.split(',').map(Number);
      const img = page.images[key];
      const sw = img.slotW || 1;
      const sh = img.slotH || 1;
      for (let r = srow; r < srow + sh; r++) {
        for (let c = scol; c < scol + sw; c++) {
          const pos = pocketPos(r, c);
          addCornerOverlays(canvas, pos.x, pos.y, pos.w, pos.h, radiusPx);
        }
      }
    }
  } else if (state.cornerMode === 'outer') {
    for (const key in page.images) {
      groupSlotPieces(page, key, page.images[key]).forEach(piece => {
        const startPos = pocketPos(piece.firstRow, piece.firstCol);
        const endPos = pocketPos(piece.lastRow, piece.lastCol);
        const w = (endPos.x + endPos.w) - startPos.x;
        const h = (endPos.y + endPos.h) - startPos.y;
        addCornerOverlays(canvas, startPos.x, startPos.y, w, h, radiusPx);
      });
    }
  }
}

// The white wedge between the square corner and the quarter-circle arc,
// drawn as an SVG path in a 1x1 viewBox. SVG is document content like <img>,
// so unlike CSS backgrounds it always prints, regardless of the browser's
// "background graphics" setting.
const SVG_NS = 'http://www.w3.org/2000/svg';
const CORNER_PATHS = {
  tl: 'M0,0 L1,0 A1,1 0 0,0 0,1 Z',
  tr: 'M1,0 L0,0 A1,1 0 0,1 1,1 Z',
  bl: 'M0,1 L0,0 A1,1 0 0,0 1,1 Z',
  br: 'M1,1 L1,0 A1,1 0 0,1 0,1 Z'
};

function addCornerOverlays(container, x, y, w, h, radiusPx) {
  const corners = [
    { cls: 'tl', dx: 0, dy: 0 },
    { cls: 'tr', dx: w - radiusPx, dy: 0 },
    { cls: 'bl', dx: 0, dy: h - radiusPx },
    { cls: 'br', dx: w - radiusPx, dy: h - radiusPx }
  ];
  corners.forEach(corner => {
    const overlay = document.createElementNS(SVG_NS, 'svg');
    overlay.setAttribute('class', 'corner-overlay');
    overlay.setAttribute('viewBox', '0 0 1 1');
    overlay.setAttribute('preserveAspectRatio', 'none');
    overlay.style.left = (x + corner.dx) + 'px';
    overlay.style.top = (y + corner.dy) + 'px';
    overlay.style.width = radiusPx + 'px';
    overlay.style.height = radiusPx + 'px';
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', CORNER_PATHS[corner.cls]);
    path.setAttribute('fill', '#fff');
    overlay.appendChild(path);
    container.appendChild(overlay);
  });
}

// ============================================================
// BINDER UPDATE
// ============================================================
function updateBinder() {
  const p = currentPage();
  const next = {
    rows: Math.round(numInput('rows', p.rows)),
    cols: Math.round(numInput('cols', p.cols)),
    pocketW: numInput('pocket-w', p.pocketW),
    pocketH: numInput('pocket-h', p.pocketH),
    seamH: numInput('seam-h', p.seamH),
    seamV: numInput('seam-v', p.seamV)
  };
  const changed = Object.keys(next).some(k => next[k] !== p[k]);
  if (changed) {
    pushHistory('binder-dims');
    Object.assign(p, next);
    while (p.seamsH.length < p.cols - 1) p.seamsH.push('cut');
    while (p.seamsH.length > p.cols - 1) p.seamsH.pop();
    while (p.seamsV.length < p.rows - 1) p.seamsV.push('cut');
    while (p.seamsV.length > p.rows - 1) p.seamsV.pop();
    loadPageToUI();
  }
  state.viewScale = (parseInt(document.getElementById('view-scale').value) || 100) / 100 * 3;
  const zoomValueEl = document.getElementById('zoom-value');
  if (zoomValueEl) {
    zoomValueEl.textContent = document.getElementById('view-scale').value + '%';
  }
  renderBinder();
  renderPagesList();
  updatePhysicalInfo();
  updateDimensionsSummary();
  updateClipboardIndicator();
}

function updateClipboardIndicator() {
  const ind = document.getElementById('clipboard-indicator');
  if (state.clipboard) {
    ind.innerHTML = '<span class="clipboard-indicator">Clipboard: ' + Math.round(state.clipboard.widthMm) + 'mm</span>';
  } else {
    ind.innerHTML = '';
  }
  const pasteBtn = document.getElementById('paste-btn');
  if (pasteBtn) pasteBtn.disabled = !state.clipboard;
}

// ============================================================
// UI CHROME: HINTS TOGGLE + COLLAPSIBLE SIDEBAR SECTIONS
// Both are per-browser presentation preferences, stored in
// localStorage rather than in the project.
// ============================================================
const HINTS_KEY = 'michify-hints';
const SECTIONS_KEY = 'michify-sections';
const DEFAULT_COLLAPSED = { quality: true };

function updateHintsVisibility() {
  const on = document.getElementById('hints-toggle').checked;
  document.body.classList.toggle('hints-hidden', !on);
  try { localStorage.setItem(HINTS_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

function loadHintsUI() {
  let on = true;
  try { on = localStorage.getItem(HINTS_KEY) !== '0'; } catch { /* ignore */ }
  document.getElementById('hints-toggle').checked = on;
  document.body.classList.toggle('hints-hidden', !on);
}

function getCollapsedSections() {
  try {
    const s = JSON.parse(localStorage.getItem(SECTIONS_KEY));
    if (s && typeof s === 'object') return s;
  } catch { /* ignore */ }
  return Object.assign({}, DEFAULT_COLLAPSED);
}

function applySectionStates() {
  const collapsed = getCollapsedSections();
  document.querySelectorAll('h2.collapsible').forEach(h2 => {
    h2.classList.toggle('collapsed', !!collapsed[h2.dataset.section]);
  });
}

function toggleSection(id) {
  const collapsed = getCollapsedSections();
  collapsed[id] = !collapsed[id];
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(collapsed)); } catch { /* ignore */ }
  applySectionStates();
}

// Shown in the Binder dimensions header while the section is collapsed.
function updateDimensionsSummary() {
  const p = currentPage();
  const el = document.getElementById('dims-summary');
  if (el) el.textContent = p.rows + '×' + p.cols + ' · ' + p.pocketW + '×' + p.pocketH + ' mm';
}

// ============================================================
// BINDER PRESETS
// Common layouts as starting points. Pocket dimensions assume
// standard 63×88 mm cards with a snug ~68×93 mm pocket; seams
// vary by brand, so these are labelled as approximate and the
// user is told to fine-tune. A preset may set a uniform seam
// type (e.g. side-loading binders use continuous seams).
// ============================================================
// Every preset states its seam type so applying one is a full starting
// layout, and so the selector can tell otherwise-identical layouts apart
// (standard 9-pocket has cut seams; side-loading has continuous seams).
const BINDER_PRESETS = [
  { id: 'std9', name: 'Standard 9-pocket (3×3)', rows: 3, cols: 3, pocketW: 68, pocketH: 93, seamH: 2, seamV: 2, seams: 'cut' },
  { id: 'p12', name: '12-pocket (4×3)', rows: 4, cols: 3, pocketW: 68, pocketH: 93, seamH: 2, seamV: 2, seams: 'cut' },
  { id: 'p16', name: '16-pocket (4×4)', rows: 4, cols: 4, pocketW: 68, pocketH: 93, seamH: 2, seamV: 2, seams: 'cut' },
  { id: 'p4', name: '4-pocket (2×2)', rows: 2, cols: 2, pocketW: 68, pocketH: 93, seamH: 2, seamV: 2, seams: 'cut' },
  { id: 'side9', name: 'Side-loading 9-pocket (continuous)', rows: 3, cols: 3, pocketW: 68, pocketH: 93, seamH: 2, seamV: 2, seams: 'continuous' },
  { id: 'small9', name: 'Small / Japanese 9-pocket (3×3)', rows: 3, cols: 3, pocketW: 61, pocketH: 87, seamH: 2, seamV: 2, seams: 'cut' }
];

function populateBinderPresets() {
  const sel = document.getElementById('binder-preset');
  if (!sel) return;
  BINDER_PRESETS.forEach(pre => {
    const opt = document.createElement('option');
    opt.value = pre.id;
    opt.textContent = pre.name;
    sel.appendChild(opt);
  });
}

// Show which preset the current page matches, or "Custom" if none.
function syncBinderPresetSelector() {
  const sel = document.getElementById('binder-preset');
  if (!sel) return;
  const p = currentPage();
  const match = BINDER_PRESETS.find(pre =>
    pre.rows === p.rows && pre.cols === p.cols &&
    pre.pocketW === p.pocketW && pre.pocketH === p.pocketH &&
    pre.seamH === p.seamH && pre.seamV === p.seamV &&
    p.seamsH.every(s => s === pre.seams) && p.seamsV.every(s => s === pre.seams)
  );
  sel.value = match ? match.id : 'custom';
}

function applyBinderPreset() {
  const sel = document.getElementById('binder-preset');
  const pre = BINDER_PRESETS.find(x => x.id === sel.value);
  if (!pre) return; // "Custom" selected: leave dimensions as they are
  pushHistory();
  const p = currentPage();
  p.rows = pre.rows;
  p.cols = pre.cols;
  p.pocketW = pre.pocketW;
  p.pocketH = pre.pocketH;
  p.seamH = pre.seamH;
  p.seamV = pre.seamV;
  while (p.seamsH.length < p.cols - 1) p.seamsH.push('cut');
  while (p.seamsH.length > p.cols - 1) p.seamsH.pop();
  while (p.seamsV.length < p.rows - 1) p.seamsV.push('cut');
  while (p.seamsV.length > p.rows - 1) p.seamsV.pop();
  if (pre.seams) {
    p.seamsH = p.seamsH.map(() => pre.seams);
    p.seamsV = p.seamsV.map(() => pre.seams);
  }
  loadPageToUI();
  renderBinder();
  renderPagesList();
  updatePhysicalInfo();
  setStatus('Applied preset: ' + pre.name);
}

// ============================================================
// VIEW ZOOM (Office-style slider)
// ============================================================
function zoomView(deltaPercent) {
  const input = document.getElementById('view-scale');
  const currentValue = parseInt(input.value) || 100;
  const minVal = parseInt(input.min) || 30;
  const maxVal = parseInt(input.max) || 500;
  const newValue = Math.max(minVal, Math.min(maxVal, currentValue + deltaPercent));
  if (newValue === currentValue) return;
  input.value = newValue;
  updateBinder();
  setStatus('Zoom: ' + newValue + '%');
}

function resetZoom() {
  const input = document.getElementById('view-scale');
  input.value = 100;
  updateBinder();
  setStatus('Zoom: 100% (reset)');
}

// Set the view zoom so the whole page fits the canvas viewport.
function zoomToFit() {
  const p = currentPage();
  const area = document.getElementById('canvas-area');
  const pad = 32; // breathing room + canvas-area padding
  const availW = area.clientWidth - pad;
  const availH = area.clientHeight - pad;
  const pageW = p.cols * p.pocketW + (p.cols - 1) * p.seamH;
  const pageH = p.rows * p.pocketH + (p.rows - 1) * p.seamV;
  if (availW <= 0 || availH <= 0 || pageW <= 0 || pageH <= 0) return;
  // viewScale (px/mm) = percent/100*3, so percent = fitScale/3*100
  const fitScale = Math.min(availW / pageW, availH / pageH);
  const input = document.getElementById('view-scale');
  const minVal = parseInt(input.min) || 30;
  const maxVal = parseInt(input.max) || 500;
  let percent = Math.round(fitScale / 3 * 100 / 10) * 10;
  percent = Math.max(minVal, Math.min(maxVal, percent));
  input.value = percent;
  updateBinder();
  setStatus('Zoom: ' + percent + '% (fit to window)');
}

// ============================================================
// IMAGE QUALITY / DOWNSCALING
// ============================================================
function updateImageQuality() {
  state.imageMaxDim = parseInt(document.getElementById('image-quality').value) || 0;
  markDirty();
  setStatus('Image quality: ' + (state.imageMaxDim === 0 ? 'Original' : state.imageMaxDim + ' px max'));
}

function loadAndProcessImage(file, callback) {
  const maxDim = state.imageMaxDim || 0;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    if (maxDim === 0) { callback(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.width, img.height);
      if (longest <= maxDim) { callback(dataUrl); return; }
      const ratio = maxDim / longest;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const isPng = file.type === 'image/png';
      const outType = isPng ? 'image/png' : 'image/jpeg';
      const quality = isPng ? undefined : 0.92;
      const scaledUrl = canvas.toDataURL(outType, quality);
      const originalKB = Math.round(dataUrl.length / 1024);
      const scaledKB = Math.round(scaledUrl.length / 1024);
      setStatus('Image downscaled: ' + img.width + '×' + img.height + ' → ' + canvas.width + '×' + canvas.height + ' (' + originalKB + ' KB → ' + scaledKB + ' KB)');
      callback(scaledUrl);
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

// ============================================================
// RENDER
// ============================================================
function renderPocketImagePart(pocketEl, imgData, slotKey, slotOriginRow, slotOriginCol, pocketRow, pocketCol) {
  const p = currentPage();
  let offsetX_mm = 0;
  let offsetY_mm = 0;
  for (let c = slotOriginCol; c < pocketCol; c++) { offsetX_mm += p.pocketW + p.seamH; }
  for (let r = slotOriginRow; r < pocketRow; r++) { offsetY_mm += p.pocketH + p.seamV; }
  pocketEl.appendChild(createSlotImage(imgData, slotKey, offsetX_mm, offsetY_mm));
}

function renderContinuousSeamBridge(canvas, imgData, slotKey, slotOriginRow, slotOriginCol, seamRow, seamCol, direction) {
  const p = currentPage();
  const scale = state.viewScale;
  const bridge = document.createElement('div');
  bridge.className = 'seam-bridge';
  let offsetX_mm = 0;
  let offsetY_mm = 0;
  if (direction === 'h') {
    const seamX_px = ((seamCol + 1) * p.pocketW + seamCol * p.seamH) * scale;
    const seamY_px = seamRow * (p.pocketH + p.seamV) * scale;
    bridge.style.left = seamX_px + 'px';
    bridge.style.top = seamY_px + 'px';
    bridge.style.width = mmToPx(p.seamH) + 'px';
    bridge.style.height = mmToPx(p.pocketH) + 'px';
    for (let c = slotOriginCol; c <= seamCol; c++) {
      offsetX_mm += p.pocketW;
      if (c < seamCol) offsetX_mm += p.seamH;
    }
    for (let r = slotOriginRow; r < seamRow; r++) { offsetY_mm += p.pocketH + p.seamV; }
  } else {
    const seamX_px = seamCol * (p.pocketW + p.seamH) * scale;
    const seamY_px = ((seamRow + 1) * p.pocketH + seamRow * p.seamV) * scale;
    bridge.style.left = seamX_px + 'px';
    bridge.style.top = seamY_px + 'px';
    bridge.style.width = mmToPx(p.pocketW) + 'px';
    bridge.style.height = mmToPx(p.seamV) + 'px';
    for (let c = slotOriginCol; c < seamCol; c++) { offsetX_mm += p.pocketW + p.seamH; }
    for (let r = slotOriginRow; r <= seamRow; r++) {
      offsetY_mm += p.pocketH;
      if (r < seamRow) offsetY_mm += p.seamV;
    }
  }
  bridge.appendChild(createSlotImage(imgData, slotKey, offsetX_mm, offsetY_mm));
  canvas.appendChild(bridge);
}

function renderBinder() {
  const p = currentPage();
  const canvas = document.getElementById('binder-canvas');
  canvas.innerHTML = '';
  const scale = state.viewScale;
  const totalW = (p.cols * p.pocketW + (p.cols - 1) * p.seamH) * scale;
  const totalH = (p.rows * p.pocketH + (p.rows - 1) * p.seamV) * scale;
  canvas.style.width = totalW + 'px';
  canvas.style.height = totalH + 'px';
  // Render pockets with image parts
  for (let row = 0; row < p.rows; row++) {
    for (let col = 0; col < p.cols; col++) {
      const pos = pocketPos(row, col);
      const pocket = document.createElement('div');
      pocket.className = 'pocket';
      pocket.style.left = pos.x + 'px';
      pocket.style.top = pos.y + 'px';
      pocket.style.width = pos.w + 'px';
      pocket.style.height = pos.h + 'px';
      pocket.dataset.row = row;
      pocket.dataset.col = col;
      const slot = findSlotAt(p, row, col);
      if (slot) {
        pocket.classList.add('has-image');
        if (slot.row !== row || slot.col !== col) {
          pocket.classList.add('in-multi-slot');
        }
        renderPocketImagePart(pocket, slot.image, slot.key, slot.row, slot.col, row, col);
      } else {
        const emptyKey = row + ',' + col;
        const isIntentionalEmpty = p.emptyPockets && p.emptyPockets.includes(emptyKey);
        if (isIntentionalEmpty) {
          pocket.classList.add('intentional-empty');
        } else {
          const idx = document.createElement('div');
          idx.className = 'pocket-index';
          idx.textContent = 'R' + (row + 1) + 'C' + (col + 1);
          pocket.appendChild(idx);
        }
      }
      if (state.selectedSlot && !slot && state.selectedSlot.row === row && state.selectedSlot.col === col) {
        pocket.classList.add('selected');
      }
      if (state.rangeSelection) {
        const rs = state.rangeSelection;
        if (row >= rs.startRow && row <= rs.endRow && col >= rs.startCol && col <= rs.endCol) {
          pocket.classList.add('range-selected');
        }
      }
      pocket.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.shiftKey && state.selectedSlot) {
          const startR = Math.min(state.selectedSlot.row, row);
          const startC = Math.min(state.selectedSlot.col, col);
          const endR = Math.max(state.selectedSlot.row, row);
          const endC = Math.max(state.selectedSlot.col, col);
          setRangeSelection(startR, startC, endR, endC);
          e.preventDefault();
          return;
        }
        // Alt-drag on an image pocket = move/swap image between slots
        if (e.altKey && slot) {
          movingImage = { fromKey: slot.key, fromRow: slot.row, fromCol: slot.col, startX: e.clientX, startY: e.clientY };
          e.preventDefault();
          return;
        }
        if (!slot) {
          rangeSelecting = { startRow: row, startCol: col, currentRow: row, currentCol: col };
        }
      });
      pocket.addEventListener('mouseenter', () => {
        if (rangeSelecting) {
          rangeSelecting.currentRow = row;
          rangeSelecting.currentCol = col;
          updateRangeSelectionPreview();
        }
        if (movingImage) {
          document.querySelectorAll('.pocket.move-target').forEach(el => el.classList.remove('move-target'));
          pocket.classList.add('move-target');
        }
      });
      pocket.addEventListener('click', (e) => {
        if (dragging) return;
        if (e.shiftKey) return;
        if (!rangeSelecting || (rangeSelecting.startRow === row && rangeSelecting.startCol === col)) {
          if (slot) selectAt(slot.row, slot.col);
          else selectAt(row, col);
        }
      });
      pocket.addEventListener('contextmenu', (e) => {
        const s = findSlotAt(currentPage(), row, col);
        if (s) selectAt(s.row, s.col);
        else selectAt(row, col);
        showContextMenu(e, { row, col });
      });
      pocket.addEventListener('dragover', (e) => { e.preventDefault(); pocket.classList.add('drag-over'); });
      pocket.addEventListener('dragleave', () => pocket.classList.remove('drag-over'));
      pocket.addEventListener('drop', (e) => {
        e.preventDefault();
        pocket.classList.remove('drag-over');
        handleDrop(e, row, col);
      });
      canvas.appendChild(pocket);
    }
  }
  // Render continuous seam bridges
  for (const key in p.images) {
    const [srow, scol] = key.split(',').map(Number);
    const img = p.images[key];
    const sw = img.slotW || 1;
    const sh = img.slotH || 1;
    for (let c = scol; c < scol + sw - 1; c++) {
      if (p.seamsH[c] === 'continuous') {
        for (let r = srow; r < srow + sh; r++) {
          renderContinuousSeamBridge(canvas, img, key, srow, scol, r, c, 'h');
        }
      }
    }
    for (let r = srow; r < srow + sh - 1; r++) {
      if (p.seamsV[r] === 'continuous') {
        for (let c = scol; c < scol + sw; c++) {
          renderContinuousSeamBridge(canvas, img, key, srow, scol, r, c, 'v');
        }
      }
    }
  }
  // Render cut seam masks
  for (const key in p.images) {
    const [srow, scol] = key.split(',').map(Number);
    const img = p.images[key];
    const sw = img.slotW || 1;
    const sh = img.slotH || 1;
    for (let c = scol; c < scol + sw - 1; c++) {
      if (p.seamsH[c] === 'cut') {
        for (let r = srow; r < srow + sh; r++) {
          const seamX = ((c + 1) * p.pocketW + c * p.seamH) * scale;
          const seamY = r * (p.pocketH + p.seamV) * scale;
          const mask = document.createElement('div');
          mask.className = 'cut-seam-mask';
          mask.style.left = seamX + 'px';
          mask.style.top = seamY + 'px';
          mask.style.width = mmToPx(p.seamH) + 'px';
          mask.style.height = mmToPx(p.pocketH) + 'px';
          canvas.appendChild(mask);
        }
      }
    }
    for (let r = srow; r < srow + sh - 1; r++) {
      if (p.seamsV[r] === 'cut') {
        for (let c = scol; c < scol + sw; c++) {
          const seamX = c * (p.pocketW + p.seamH) * scale;
          const seamY = ((r + 1) * p.pocketH + r * p.seamV) * scale;
          const mask = document.createElement('div');
          mask.className = 'cut-seam-mask';
          mask.style.left = seamX + 'px';
          mask.style.top = seamY + 'px';
          mask.style.width = mmToPx(p.pocketW) + 'px';
          mask.style.height = mmToPx(p.seamV) + 'px';
          canvas.appendChild(mask);
        }
      }
    }
  }
  renderCornerOverlays(canvas);
  // Selected slot outline (on top of everything)
  if (state.selectedSlot) {
    const { row, col } = state.selectedSlot;
    const img = p.images[row + ',' + col];
    if (img) {
      const sw = img.slotW || 1;
      const sh = img.slotH || 1;
      const startPos = pocketPos(row, col);
      const size = slotSizeMm(p, sw, sh);
      const outline = document.createElement('div');
      outline.className = 'slot-outline';
      outline.style.left = startPos.x + 'px';
      outline.style.top = startPos.y + 'px';
      outline.style.width = mmToPx(size.w) + 'px';
      outline.style.height = mmToPx(size.h) + 'px';
      canvas.appendChild(outline);
    }
  }
  // Seam toggle buttons (horizontal)
  for (let row = 0; row < p.rows; row++) {
    for (let s = 0; s < p.cols - 1; s++) {
      const pos = pocketPos(row, s);
      const seam = document.createElement('div');
      seam.className = 'seam-toggle' + (p.seamsH[s] === 'continuous' ? ' continuous' : '');
      seam.style.left = (pos.x + p.pocketW * scale) + 'px';
      seam.style.top = pos.y + 'px';
      seam.style.width = Math.max(6, p.seamH * scale) + 'px';
      seam.style.height = (p.pocketH * scale) + 'px';
      seam.title = 'H-seam col ' + (s + 1) + '-' + (s + 2) + ': ' + p.seamsH[s];
      seam.addEventListener('click', (e) => { e.stopPropagation(); toggleSeam('h', s); });
      canvas.appendChild(seam);
    }
  }
  // Seam toggle buttons (vertical)
  for (let col = 0; col < p.cols; col++) {
    for (let s = 0; s < p.rows - 1; s++) {
      const pos = pocketPos(s, col);
      const seam = document.createElement('div');
      seam.className = 'seam-toggle' + (p.seamsV[s] === 'continuous' ? ' continuous' : '');
      seam.style.left = pos.x + 'px';
      seam.style.top = (pos.y + p.pocketH * scale) + 'px';
      seam.style.width = (p.pocketW * scale) + 'px';
      seam.style.height = Math.max(6, p.seamV * scale) + 'px';
      seam.title = 'V-seam row ' + (s + 1) + '-' + (s + 2) + ': ' + p.seamsV[s];
      seam.addEventListener('click', (e) => { e.stopPropagation(); toggleSeam('v', s); });
      canvas.appendChild(seam);
    }
  }
  updateProperties();
}

// ============================================================
// SELECTION
// ============================================================
function setRangeSelection(startRow, startCol, endRow, endCol) {
  const w = endCol - startCol + 1;
  const h = endRow - startRow + 1;
  if (!isAreaFree(currentPage(), startRow, startCol, w, h, null)) {
    setStatus('Area contains other images, selection cancelled');
    state.rangeSelection = null;
    state.selectedSlot = { row: startRow, col: startCol };
    renderBinder();
    return;
  }
  state.rangeSelection = { startRow, startCol, endRow, endCol };
  state.selectedSlot = { row: startRow, col: startCol };
  document.getElementById('slot-w').value = w;
  document.getElementById('slot-h').value = h;
  renderBinder();
  setStatus('Area: ' + w + 'x' + h + ' pockets. Drop image or paste crop.');
}

function updateRangeSelectionPreview() {
  if (!rangeSelecting) return;
  document.querySelectorAll('.pocket.range-selected').forEach(el => el.classList.remove('range-selected'));
  const startR = Math.min(rangeSelecting.startRow, rangeSelecting.currentRow);
  const startC = Math.min(rangeSelecting.startCol, rangeSelecting.currentCol);
  const endR = Math.max(rangeSelecting.startRow, rangeSelecting.currentRow);
  const endC = Math.max(rangeSelecting.startCol, rangeSelecting.currentCol);
  document.querySelectorAll('.pocket').forEach(el => {
    const r = parseInt(el.dataset.row);
    const c = parseInt(el.dataset.col);
    if (r >= startR && r <= endR && c >= startC && c <= endC) {
      el.classList.add('range-selected');
    }
  });
}

function selectAt(row, col) {
  const slot = findSlotAt(currentPage(), row, col);
  if (slot) state.selectedSlot = { row: slot.row, col: slot.col };
  else state.selectedSlot = { row, col };
  state.rangeSelection = null;
  renderBinder();
}

function toggleSeam(dir, idx) {
  const p = currentPage();
  pushHistory();
  const arr = dir === 'h' ? p.seamsH : p.seamsV;
  arr[idx] = arr[idx] === 'cut' ? 'continuous' : 'cut';
  renderBinder();
  updatePhysicalInfo();
  syncBinderPresetSelector();
}

function setAllSeams(type) {
  const p = currentPage();
  pushHistory();
  p.seamsH = p.seamsH.map(() => type);
  p.seamsV = p.seamsV.map(() => type);
  renderBinder();
  updatePhysicalInfo();
  syncBinderPresetSelector();
}

// ============================================================
// PROPERTIES PANEL
// ============================================================
function updateProperties() {
  const props = document.getElementById('pocket-props');
  const slotSection = document.getElementById('slot-size-section');
  const imgSection = document.getElementById('image-section');
  if (!state.selectedSlot) {
    props.innerHTML = '<div class="empty-note">No selection</div>';
    slotSection.style.display = 'block';
    imgSection.classList.add('hidden');
    return;
  }
  const { row, col } = state.selectedSlot;
  const key = row + ',' + col;
  const p = currentPage();
  const img = p.images[key];
  slotSection.style.display = 'block';
  if (img) {
    const sw = img.slotW || 1;
    const sh = img.slotH || 1;
    const slotMm = slotSizeMm(p, sw, sh);
    props.innerHTML = '<div style="font-size:13px">Image: R' + (row + 1) + 'C' + (col + 1) + '</div>' +
      '<div style="font-size:11px;color:#888;margin-top:4px">Slot: ' + sw + 'x' + sh + ' pockets = ' + slotMm.w.toFixed(1) + 'x' + slotMm.h.toFixed(1) + ' mm</div>' +
      '<div style="font-size:11px;color:#888">Image width: ' + img.widthMm.toFixed(1) + ' mm</div>';
    imgSection.classList.remove('hidden');
    document.getElementById('slot-w').value = sw;
    document.getElementById('slot-h').value = sh;
    document.getElementById('img-width-mm').value = img.widthMm.toFixed(1);
    document.getElementById('img-x-mm').value = img.xMm.toFixed(1);
    document.getElementById('img-y-mm').value = img.yMm.toFixed(1);
    document.getElementById('img-rotate').value = img.rotate;
  } else {
    let extra = '';
    const isIntentionalEmpty = p.emptyPockets && p.emptyPockets.includes(key);
    if (state.rangeSelection) {
      const rs = state.rangeSelection;
      const w = rs.endCol - rs.startCol + 1;
      const h = rs.endRow - rs.startRow + 1;
      extra = '<div style="font-size:11px;color:#FFB000;margin-top:4px">Area selected: ' + w + 'x' + h + '. Drop image, paste crop, or press E to mark as empty.</div>';
    } else if (isIntentionalEmpty) {
      extra = '<div style="font-size:11px;color:#FFB000;margin-top:4px">Intentionally empty. Press E to unmark, or drop an image to fill.</div>';
    } else {
      extra = '<div style="font-size:11px;color:#888;margin-top:4px">Set slot size and drop image, or press E to mark as intentionally empty.</div>';
    }
    props.innerHTML = '<div style="font-size:13px">Empty: R' + (row + 1) + 'C' + (col + 1) + '</div>' + extra;
    imgSection.classList.add('hidden');
    if (!state.rangeSelection) {
      document.getElementById('slot-w').value = 1;
      document.getElementById('slot-h').value = 1;
    }
  }
  updateClipboardIndicator();
}

function resizeSlot() {
  if (!state.selectedSlot) return;
  const { row, col } = state.selectedSlot;
  const key = row + ',' + col;
  const p = currentPage();
  const img = p.images[key];
  const newW = Math.round(numInput('slot-w', img ? (img.slotW || 1) : 1));
  const newH = Math.round(numInput('slot-h', img ? (img.slotH || 1) : 1));
  if (!isAreaFree(p, row, col, newW, newH, key)) {
    setStatus('Area does not fit or is occupied');
    if (img) {
      document.getElementById('slot-w').value = img.slotW || 1;
      document.getElementById('slot-h').value = img.slotH || 1;
    }
    return;
  }
  if (img) {
    if (newW !== (img.slotW || 1) || newH !== (img.slotH || 1)) {
      pushHistory();
      img.slotW = newW;
      img.slotH = newH;
      clampImage(p, img);
    }
  } else {
    state.rangeSelection = { startRow: row, startCol: col, endRow: row + newH - 1, endCol: col + newW - 1 };
  }
  renderBinder();
  setStatus('Slot: ' + newW + 'x' + newH);
}

function updateImageProps() {
  if (!state.selectedSlot) return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  const img = currentPage().images[key];
  if (!img) return;
  const next = {
    widthMm: numInput('img-width-mm', img.widthMm),
    xMm: numInput('img-x-mm', img.xMm),
    yMm: numInput('img-y-mm', img.yMm),
    rotate: parseInt(document.getElementById('img-rotate').value) || 0
  };
  if (next.widthMm === img.widthMm && next.xMm === img.xMm && next.yMm === img.yMm && next.rotate === img.rotate) {
    return;
  }
  pushHistory('img-props');
  Object.assign(img, next);
  clampImage(currentPage(), img);
  renderBinder();
}

function zoomImage(deltaMm) {
  if (!state.selectedSlot) return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  const p = currentPage();
  const img = p.images[key];
  if (!img) return;
  pushHistory('img-zoom');
  const slot = slotSizeMm(p, img.slotW || 1, img.slotH || 1);
  const centerX = -img.xMm + slot.w / 2;
  const centerY = -img.yMm + slot.h / 2;
  const oldW = img.widthMm;
  const newW = Math.max(10, Math.min(2000, oldW + deltaMm));
  const ratio = newW / oldW;
  img.widthMm = newW;
  img.xMm = -(centerX * ratio - slot.w / 2);
  img.yMm = -(centerY * ratio - slot.h / 2);
  clampImage(p, img);
  refreshSlotImages(key);
  updateProperties();
}

function autoFitCover() {
  if (!state.selectedSlot) return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  if (!currentPage().images[key]) return;
  pushHistory();
  autoFitImage(state.selectedSlot.row, state.selectedSlot.col);
}

function removeImage() {
  if (!state.selectedSlot) return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  const p = currentPage();
  if (!p.images[key]) return;
  pushHistory();
  delete p.images[key];
  renderBinder();
  setStatus('Image removed');
}

// ============================================================
// INTENTIONAL EMPTY POCKET (Michi Method)
// ============================================================
function clearEmptyMarks(p, row, col, sw, sh) {
  if (!p.emptyPockets || p.emptyPockets.length === 0) return;
  for (let r = row; r < row + sh; r++) {
    for (let c = col; c < col + sw; c++) {
      const idx = p.emptyPockets.indexOf(r + ',' + c);
      if (idx >= 0) p.emptyPockets.splice(idx, 1);
    }
  }
}

function toggleIntentionalEmpty() {
  if (!state.selectedSlot) return;
  const { row, col } = state.selectedSlot;
  const p = currentPage();
  if (!p.emptyPockets) p.emptyPockets = [];
  // Cannot mark a pocket that has an image
  if (findSlotAt(p, row, col)) {
    setStatus('Remove image first to mark as empty');
    return;
  }
  // If range selected, toggle all pockets in the range
  if (state.rangeSelection) {
    const rs = state.rangeSelection;
    const keys = [];
    for (let r = rs.startRow; r <= rs.endRow; r++) {
      for (let c = rs.startCol; c <= rs.endCol; c++) {
        if (!findSlotAt(p, r, c)) keys.push(r + ',' + c);
      }
    }
    if (keys.length === 0) return;
    pushHistory();
    const allMarked = keys.every(k => p.emptyPockets.includes(k));
    if (allMarked) {
      p.emptyPockets = p.emptyPockets.filter(k => !keys.includes(k));
      setStatus('Unmarked ' + keys.length + ' pockets');
    } else {
      keys.forEach(k => { if (!p.emptyPockets.includes(k)) p.emptyPockets.push(k); });
      setStatus('Marked ' + keys.length + ' pockets as intentionally empty');
    }
    state.rangeSelection = null;
    renderBinder();
    return;
  }
  // Single pocket toggle
  const key = row + ',' + col;
  pushHistory();
  const idx = p.emptyPockets.indexOf(key);
  if (idx >= 0) {
    p.emptyPockets.splice(idx, 1);
    setStatus('Pocket R' + (row + 1) + 'C' + (col + 1) + ' unmarked');
  } else {
    p.emptyPockets.push(key);
    setStatus('Pocket R' + (row + 1) + 'C' + (col + 1) + ' marked as intentionally empty');
  }
  renderBinder();
}

// ============================================================
// COPY / PASTE CROP
// ============================================================
function copyImageSettings() {
  if (!state.selectedSlot) return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  const img = currentPage().images[key];
  if (!img) return;
  state.clipboard = {
    widthMm: img.widthMm, xMm: img.xMm, yMm: img.yMm, rotate: img.rotate,
    src: img.src, _naturalRatio: img._naturalRatio
  };
  // Marker in the OS clipboard so a later Ctrl+V prefers the crop over any
  // stale image data that was copied before it.
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(CROP_CLIPBOARD_MARKER).catch(() => {});
  }
  updateClipboardIndicator();
  setStatus('Crop copied (image width ' + img.widthMm.toFixed(1) + ' mm)');
}

function pasteImageSettings() {
  if (!state.selectedSlot || !state.clipboard) return;
  const { row, col } = state.selectedSlot;
  const key = row + ',' + col;
  const p = currentPage();
  const cb = state.clipboard;
  let sw = 1, sh = 1;
  const existing = p.images[key];
  if (existing) {
    sw = existing.slotW || 1;
    sh = existing.slotH || 1;
  } else if (state.rangeSelection) {
    const rs = state.rangeSelection;
    sw = rs.endCol - rs.startCol + 1;
    sh = rs.endRow - rs.startRow + 1;
  } else {
    sw = Math.round(numInput('slot-w', 1));
    sh = Math.round(numInput('slot-h', 1));
    if (!isAreaFree(p, row, col, sw, sh, null)) { sw = 1; sh = 1; }
  }
  pushHistory();
  p.images[key] = {
    src: cb.src, widthMm: cb.widthMm, xMm: cb.xMm, yMm: cb.yMm, rotate: cb.rotate,
    _naturalRatio: cb._naturalRatio, slotW: sw, slotH: sh
  };
  clampImage(p, p.images[key]);
  clearEmptyMarks(p, row, col, sw, sh);
  state.rangeSelection = null;
  renderBinder();
  setStatus('Crop pasted (' + cb.widthMm.toFixed(1) + ' mm)');
}

// ============================================================
// EXPAND SLOT (grow current slot by one pocket)
// ============================================================
function expandSlot(dir) {
  if (!state.selectedSlot) return;
  const { row, col } = state.selectedSlot;
  const key = row + ',' + col;
  const p = currentPage();
  const img = p.images[key];
  if (!img) {
    setStatus('Select an image slot to expand');
    return;
  }
  const sw = img.slotW || 1;
  const sh = img.slotH || 1;
  let newRow = row, newCol = col, newW = sw, newH = sh;
  if (dir === 'right') {
    newW = sw + 1;
  } else if (dir === 'down') {
    newH = sh + 1;
  } else if (dir === 'left') {
    newCol = col - 1;
    newW = sw + 1;
  } else if (dir === 'up') {
    newRow = row - 1;
    newH = sh + 1;
  }
  if (!isAreaFree(p, newRow, newCol, newW, newH, key)) {
    setStatus('Cannot expand ' + dir + ': edge reached or space occupied');
    return;
  }
  pushHistory();
  // If the origin moved (left/up), relocate the image to the new origin key
  const newKey = newRow + ',' + newCol;
  if (newKey !== key) {
    delete p.images[key];
    // Shift the image offset so the visible content stays in place
    if (dir === 'left') {
      img.xMm += p.pocketW + p.seamH;
    } else if (dir === 'up') {
      img.yMm += p.pocketH + p.seamV;
    }
    p.images[newKey] = img;
  }
  img.slotW = newW;
  img.slotH = newH;
  clampImage(p, img);
  clearEmptyMarks(p, newRow, newCol, newW, newH);
  state.selectedSlot = { row: newRow, col: newCol };
  renderBinder();
  setStatus('Expanded ' + dir + ' to ' + newW + 'x' + newH);
}

// ============================================================
// TRIM SLOT (shrink by one pocket from the chosen side)
// The counterpart of expandSlot: each edge of the slot can be
// moved outward (expand) or inward (trim), so an accidental
// expand is reversed by trimming the same side. Offsets shift
// by exactly one pocket so the visible crop stays in place.
// ============================================================
function trimSlot(dir) {
  if (!state.selectedSlot) return;
  const { row, col } = state.selectedSlot;
  const key = row + ',' + col;
  const p = currentPage();
  const img = p.images[key];
  if (!img) {
    setStatus('Select an image slot to trim');
    return;
  }
  const sw = img.slotW || 1;
  const sh = img.slotH || 1;
  if ((dir === 'left' || dir === 'right') && sw <= 1) {
    setStatus('Slot is already 1 pocket wide');
    return;
  }
  if ((dir === 'up' || dir === 'down') && sh <= 1) {
    setStatus('Slot is already 1 pocket tall');
    return;
  }
  pushHistory();
  let newRow = row, newCol = col;
  if (dir === 'right') {
    img.slotW = sw - 1;
  } else if (dir === 'down') {
    img.slotH = sh - 1;
  } else if (dir === 'left') {
    newCol = col + 1;
    delete p.images[key];
    img.xMm -= p.pocketW + p.seamH;
    img.slotW = sw - 1;
    p.images[newRow + ',' + newCol] = img;
  } else if (dir === 'up') {
    newRow = row + 1;
    delete p.images[key];
    img.yMm -= p.pocketH + p.seamV;
    img.slotH = sh - 1;
    p.images[newRow + ',' + newCol] = img;
  }
  clampImage(p, img);
  state.selectedSlot = { row: newRow, col: newCol };
  renderBinder();
  setStatus('Trimmed ' + dir + ' to ' + (img.slotW || 1) + 'x' + (img.slotH || 1));
}

// ============================================================
// CONTEXT MENU (right-click on pockets)
// ============================================================
function buildContextItems(ctx) {
  const p = currentPage();
  const key = ctx.row + ',' + ctx.col;
  const slot = findSlotAt(p, ctx.row, ctx.col);
  const hasImage = !!slot;
  const isEmpty = p.emptyPockets && p.emptyPockets.includes(key);
  const hasClipboard = !!state.clipboard;
  const items = [];

  items.push({
    label: 'Add image…',
    action: () => document.getElementById('add-image-file').click()
  });

  items.push({
    label: isEmpty ? 'Unmark empty (E)' : 'Mark empty (E)',
    disabled: hasImage,
    action: () => toggleIntentionalEmpty()
  });

  items.push({
    label: 'Remove image (Delete)',
    disabled: !hasImage,
    action: () => removeImage()
  });

  items.push({ separator: true });

  items.push({
    label: 'Copy crop (Ctrl+C)',
    disabled: !hasImage,
    action: () => copyImageSettings()
  });
  items.push({
    label: 'Paste crop (Ctrl+V)',
    disabled: !hasClipboard,
    action: () => pasteImageSettings()
  });

  if (hasImage) {
    items.push({ separator: true });
    items.push({ label: 'Expand left', action: () => expandSlot('left') });
    items.push({ label: 'Expand right', action: () => expandSlot('right') });
    items.push({ label: 'Expand up', action: () => expandSlot('up') });
    items.push({ label: 'Expand down', action: () => expandSlot('down') });
    const sw = slot.image.slotW || 1;
    const sh = slot.image.slotH || 1;
    if (sw > 1 || sh > 1) {
      items.push({ separator: true });
      if (sw > 1) {
        items.push({ label: 'Trim left', action: () => trimSlot('left') });
        items.push({ label: 'Trim right', action: () => trimSlot('right') });
      }
      if (sh > 1) {
        items.push({ label: 'Trim top', action: () => trimSlot('up') });
        items.push({ label: 'Trim bottom', action: () => trimSlot('down') });
      }
    }
  }

  return items;
}

function showContextMenu(e, ctx) {
  e.preventDefault();
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';

  const items = buildContextItems(ctx);
  items.forEach(it => {
    if (it.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-sep';
      menu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = 'context-item' + (it.disabled ? ' disabled' : '');
    el.textContent = it.label;
    if (!it.disabled) {
      el.addEventListener('click', () => {
        it.action();
        closeContextMenu();
      });
    }
    menu.appendChild(el);
  });

  document.body.appendChild(menu);
  const menuW = menu.offsetWidth;
  const menuH = menu.offsetHeight;
  let x = e.clientX;
  let y = e.clientY;
  if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 4;
  if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 4;
  menu.style.left = Math.max(0, x) + 'px';
  menu.style.top = Math.max(0, y) + 'px';

  setTimeout(() => {
    document.addEventListener('mousedown', onContextOutside, { once: true });
    document.addEventListener('keydown', onContextEscape);
  }, 0);
}

function onContextOutside(e) {
  const menu = document.querySelector('.context-menu');
  if (menu && menu.contains(e.target)) {
    document.addEventListener('mousedown', onContextOutside, { once: true });
    return;
  }
  closeContextMenu();
}

function onContextEscape(e) {
  if (e.key === 'Escape') closeContextMenu();
}

function closeContextMenu() {
  const existing = document.querySelector('.context-menu');
  if (existing) existing.remove();
  document.removeEventListener('keydown', onContextEscape);
}

// ============================================================
// MOVE / SWAP IMAGE BETWEEN SLOTS (Alt+drag)
// ============================================================
function moveOrSwapImage(fromRow, fromCol, toRow, toCol) {
  const p = currentPage();
  const fromKey = fromRow + ',' + fromCol;
  const srcImg = p.images[fromKey];
  if (!srcImg) return;
  const targetSlot = findSlotAt(p, toRow, toCol);
  const targetKey = targetSlot ? targetSlot.key : toRow + ',' + toCol;
  if (targetKey === fromKey) return;
  const [tRow, tCol] = targetKey.split(',').map(Number);
  const srcW = srcImg.slotW || 1;
  const srcH = srcImg.slotH || 1;
  if (targetSlot) {
    // Swap: target has an image
    const targetImg = targetSlot.image;
    const targetW = targetImg.slotW || 1;
    const targetH = targetImg.slotH || 1;
    const ignore = [fromKey, targetKey];
    const sourceFits = isAreaFree(p, fromRow, fromCol, targetW, targetH, ignore);
    const targetFits = isAreaFree(p, tRow, tCol, srcW, srcH, ignore);
    if (!sourceFits || !targetFits) {
      setStatus('Swap failed: slot sizes incompatible');
      return;
    }
    pushHistory();
    p.images[fromKey] = Object.assign({}, targetImg);
    p.images[targetKey] = Object.assign({}, srcImg);
    clampImage(p, p.images[fromKey]);
    clampImage(p, p.images[targetKey]);
    state.selectedSlot = { row: tRow, col: tCol };
    setStatus('Images swapped');
  } else {
    // Move: target is empty
    if (!isAreaFree(p, tRow, tCol, srcW, srcH, [fromKey])) {
      setStatus('Move failed: not enough space at target');
      return;
    }
    pushHistory();
    delete p.images[fromKey];
    p.images[targetKey] = srcImg;
    clampImage(p, p.images[targetKey]);
    clearEmptyMarks(p, tRow, tCol, srcW, srcH);
    state.selectedSlot = { row: tRow, col: tCol };
    setStatus('Image moved');
  }
  renderBinder();
}

// ============================================================
// ADDING IMAGES (drag & drop, file picker, clipboard paste)
// ============================================================
function handleDrop(e, row, col) {
  if (e.dataTransfer.files.length === 0) return;
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length === 0) {
    setStatus('Only image files');
    return;
  }
  placeImageFiles(files, row, col);
}

function findFreePocket(p, claimed) {
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const k = r + ',' + c;
      if (claimed.has(k)) continue;
      if (findSlotAt(p, r, c)) continue;
      if (p.emptyPockets && p.emptyPockets.includes(k)) continue;
      return { row: r, col: c };
    }
  }
  return null;
}

// Place one or more image files starting at (row, col). The first file uses
// the current selection/slot sizing rules; the rest go into the next free
// pockets as 1x1 slots.
function placeImageFiles(files, row, col) {
  if (!files.length) return;
  const p = currentPage();
  const existingSlot = findSlotAt(p, row, col);
  let targetRow = existingSlot ? existingSlot.row : row;
  let targetCol = existingSlot ? existingSlot.col : col;
  let sw = 1, sh = 1;
  if (state.rangeSelection && !existingSlot) {
    const rs = state.rangeSelection;
    if (row >= rs.startRow && row <= rs.endRow && col >= rs.startCol && col <= rs.endCol) {
      targetRow = rs.startRow;
      targetCol = rs.startCol;
      sw = rs.endCol - rs.startCol + 1;
      sh = rs.endRow - rs.startRow + 1;
    } else {
      sw = Math.round(numInput('slot-w', 1));
      sh = Math.round(numInput('slot-h', 1));
      if (!isAreaFree(p, row, col, sw, sh, null)) { sw = 1; sh = 1; }
    }
    state.rangeSelection = null;
  } else if (existingSlot) {
    sw = existingSlot.image.slotW || 1;
    sh = existingSlot.image.slotH || 1;
  } else if (state.selectedSlot && state.selectedSlot.row === row && state.selectedSlot.col === col) {
    sw = Math.round(numInput('slot-w', 1));
    sh = Math.round(numInput('slot-h', 1));
    if (!isAreaFree(p, row, col, sw, sh, null)) { sw = 1; sh = 1; }
  }
  // Resolve every target up front so async image loading cannot race the
  // free-pocket search.
  const targets = [{ file: files[0], row: targetRow, col: targetCol, sw, sh }];
  const claimed = new Set();
  for (let r = targetRow; r < targetRow + sh; r++) {
    for (let c = targetCol; c < targetCol + sw; c++) claimed.add(r + ',' + c);
  }
  for (let i = 1; i < files.length; i++) {
    const spot = findFreePocket(p, claimed);
    if (!spot) {
      setStatus('Placed ' + i + ' of ' + files.length + ' images: no more free pockets');
      break;
    }
    targets.push({ file: files[i], row: spot.row, col: spot.col, sw: 1, sh: 1 });
    claimed.add(spot.row + ',' + spot.col);
  }
  pushHistory();
  targets.forEach(t => {
    loadAndProcessImage(t.file, (dataUrl) => {
      p.images[t.row + ',' + t.col] = { src: dataUrl, widthMm: 100, xMm: 0, yMm: 0, rotate: 0, slotW: t.sw, slotH: t.sh };
      clearEmptyMarks(p, t.row, t.col, t.sw, t.sh);
      autoFitImage(t.row, t.col);
    });
  });
  state.selectedSlot = { row: targetRow, col: targetCol };
}

function addImagesFromInput(event) {
  const files = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
  event.target.value = '';
  if (files.length === 0) return;
  let row, col;
  if (state.selectedSlot) {
    row = state.selectedSlot.row;
    col = state.selectedSlot.col;
  } else {
    const spot = findFreePocket(currentPage(), new Set());
    if (!spot) { setStatus('No free pockets on this page'); return; }
    row = spot.row;
    col = spot.col;
  }
  placeImageFiles(files, row, col);
}

function autoFitImage(row, col) {
  const p = currentPage();
  const key = row + ',' + col;
  const d = p.images[key];
  if (!d) return;
  const tempImg = new Image();
  tempImg.onload = () => {
    d._naturalRatio = tempImg.width / tempImg.height;
    d._naturalPxWidth = tempImg.width;
    d._naturalPxHeight = tempImg.height;
    coverFit(p, d);
    renderBinder();
  };
  tempImg.src = d.src;
}

// ============================================================
// PAGES MANAGEMENT
// ============================================================
// Small schematic preview of a page: one cell per pocket, colored by
// state (image / intentional empty / empty). Cheap to build and gives a
// visual sense of each page's layout for navigation.
function buildPageThumbnail(page) {
  const thumb = document.createElement('div');
  thumb.className = 'page-thumb';
  const maxSide = 34;
  const pageW = page.cols * page.pocketW + (page.cols - 1) * page.seamH;
  const pageH = page.rows * page.pocketH + (page.rows - 1) * page.seamV;
  const scale = maxSide / Math.max(pageW, pageH);
  thumb.style.width = (pageW * scale) + 'px';
  thumb.style.height = (pageH * scale) + 'px';
  thumb.style.gridTemplateColumns = 'repeat(' + page.cols + ', 1fr)';
  thumb.style.gridTemplateRows = 'repeat(' + page.rows + ', 1fr)';
  for (let r = 0; r < page.rows; r++) {
    for (let c = 0; c < page.cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'thumb-cell';
      if (findSlotAt(page, r, c)) cell.classList.add('has-image');
      else if (page.emptyPockets && page.emptyPockets.includes(r + ',' + c)) cell.classList.add('empty-mark');
      thumb.appendChild(cell);
    }
  }
  return thumb;
}

function renderPagesList() {
  const list = document.getElementById('pages-list');
  list.innerHTML = '';
  state.pages.forEach((page, i) => {
    const item = document.createElement('div');
    item.className = 'page-item' + (i === state.currentPage ? ' active' : '');

    item.appendChild(buildPageThumbnail(page));

    const label = document.createElement('span');
    label.className = 'page-label';
    label.textContent = 'Page ' + (i + 1) + ' (' + page.rows + 'x' + page.cols + ')';
    item.appendChild(label);

    const controls = document.createElement('div');
    controls.className = 'page-controls';
    const up = document.createElement('button');
    up.className = 'page-move';
    up.textContent = '▲';
    up.title = 'Move page up';
    up.disabled = i === 0;
    up.addEventListener('click', (e) => { e.stopPropagation(); movePage(i, -1); });
    const down = document.createElement('button');
    down.className = 'page-move';
    down.textContent = '▼';
    down.title = 'Move page down';
    down.disabled = i === state.pages.length - 1;
    down.addEventListener('click', (e) => { e.stopPropagation(); movePage(i, 1); });
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = 'Delete page';
    del.addEventListener('click', (e) => { e.stopPropagation(); deletePage(i); });
    controls.appendChild(up);
    controls.appendChild(down);
    controls.appendChild(del);
    item.appendChild(controls);

    item.addEventListener('click', () => switchPage(i));
    list.appendChild(item);
  });
}

// Move a page one step up (-1) or down (+1), keeping it the current page.
function movePage(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.pages.length) return;
  pushHistory();
  const [pg] = state.pages.splice(i, 1);
  state.pages.splice(j, 0, pg);
  if (state.currentPage === i) state.currentPage = j;
  else if (state.currentPage === j) state.currentPage = i;
  renderPagesList();
  setStatus('Moved page ' + (i + 1) + ' to position ' + (j + 1));
}

function addPage() {
  pushHistory();
  state.pages.push(createEmptyPage());
  state.currentPage = state.pages.length - 1;
  state.selectedSlot = null;
  state.rangeSelection = null;
  loadPageToUI();
  renderPagesList();
  renderBinder();
  updatePhysicalInfo();
}

function duplicatePage() {
  pushHistory();
  const src = currentPage();
  const copy = JSON.parse(JSON.stringify(src));
  state.pages.splice(state.currentPage + 1, 0, copy);
  state.currentPage++;
  loadPageToUI();
  renderPagesList();
  renderBinder();
}

function deletePage(i) {
  if (state.pages.length === 1) return;
  if (!confirm('Delete page ' + (i + 1) + '?')) return;
  pushHistory();
  state.pages.splice(i, 1);
  if (state.currentPage >= state.pages.length) state.currentPage = state.pages.length - 1;
  state.selectedSlot = null;
  state.rangeSelection = null;
  loadPageToUI();
  renderPagesList();
  renderBinder();
  updatePhysicalInfo();
}

function switchPage(i) {
  state.currentPage = i;
  state.selectedSlot = null;
  state.rangeSelection = null;
  loadPageToUI();
  renderPagesList();
  renderBinder();
  updatePhysicalInfo();
}

function loadPageToUI() {
  const p = currentPage();
  document.getElementById('rows').value = p.rows;
  document.getElementById('cols').value = p.cols;
  document.getElementById('pocket-w').value = p.pocketW;
  document.getElementById('pocket-h').value = p.pocketH;
  document.getElementById('seam-h').value = p.seamH;
  document.getElementById('seam-v').value = p.seamV;
  updateDimensionsSummary();
  syncBinderPresetSelector();
}

// ============================================================
// PROJECT SAVE/LOAD
// ============================================================
function saveProject() {
  const data = JSON.stringify(serializeProject(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'michify_project_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  clearDirty();
  queueAutosave();
  setStatus('Project saved');
}

function loadProject(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      pushHistory(); // allow undoing back to the pre-load project
      applyProjectData(data);
      clearDirty();
      queueAutosave();
      setStatus('Project loaded (' + state.pages.length + ' pages)');
    } catch (err) {
      alert('Load failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function applyProjectData(raw) {
  const norm = normalizeProjectData(raw);
  state.pages = norm.pages;
  state.currentPage = norm.currentPage;
  state.selectedSlot = null;
  state.rangeSelection = null;
  state.cornerMode = norm.cornerMode;
  state.cornerRadius = norm.cornerRadius;
  state.imageMaxDim = norm.imageMaxDim;
  document.getElementById('corner-mode').value = state.cornerMode;
  document.getElementById('corner-radius').value = state.cornerRadius;
  const qualitySel = document.getElementById('image-quality');
  qualitySel.value = String(state.imageMaxDim);
  if (qualitySel.value === '') {
    // Saved value no longer offered (e.g. the removed 2000 px option)
    state.imageMaxDim = 3000;
    qualitySel.value = '3000';
  }
  loadPageToUI();
  updateCorners(); // also renders the binder
  renderPagesList();
  updatePhysicalInfo();
  updateClipboardIndicator();
  // Backfill natural ratios for images saved without them
  state.pages.forEach((page) => {
    for (const key in page.images) {
      const d = page.images[key];
      if (!d._naturalRatio) {
        const t = new Image();
        t.onload = () => {
          d._naturalRatio = t.width / t.height;
          d._naturalPxWidth = t.width;
          d._naturalPxHeight = t.height;
          renderBinder();
        };
        t.src = d.src;
      }
    }
  });
}

function newProject() {
  if (!confirm('Start new project?')) return;
  pushHistory(); // allow undoing back to the old project
  state.pages = [createEmptyPage()];
  state.currentPage = 0;
  state.selectedSlot = null;
  state.rangeSelection = null;
  state.viewScale = 3;
  state.clipboard = null;
  state.cornerMode = 'none';
  state.cornerRadius = 3.18;
  state.imageMaxDim = 3000;
  loadPageToUI();
  document.getElementById('corner-mode').value = 'none';
  document.getElementById('corner-radius').value = 3.18;
  document.getElementById('image-quality').value = '3000';
  document.getElementById('view-scale').value = 100;
  clearDirty();
  clearAutosave().catch(() => {});
  updateCorners();
  renderPagesList();
  renderBinder();
  updatePhysicalInfo();
  updateClipboardIndicator();
}

// ============================================================
// UNDO / REDO
// ============================================================
function afterHistoryChange(msg) {
  loadPageToUI();
  renderPagesList();
  renderBinder();
  updatePhysicalInfo();
  setStatus(msg);
}

function undoAction() {
  if (undo()) afterHistoryChange('Undo');
  else setStatus('Nothing to undo');
}

function redoAction() {
  if (redo()) afterHistoryChange('Redo');
  else setStatus('Nothing to redo');
}

// ============================================================
// AUTOSAVE (IndexedDB) + UNSAVED-CHANGES WARNING
// ============================================================
let autosaveTimer = null;

function queueAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(flushAutosave, 1500);
}

function flushAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  saveAutosave(serializeProject()).catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && autosaveTimer) flushAutosave();
});

window.addEventListener('beforeunload', (e) => {
  if (autosaveTimer) flushAutosave();
  if (!isDirty() || !projectHasContent({ pages: state.pages })) return;
  e.preventDefault();
  e.returnValue = '';
});

// ============================================================
// PRINT LOGIC - BIN PACKING WITH SEAM GAPS AND CORNER ROUNDING
// ============================================================
function collectPrintPieces() {
  const pieces = [];
  state.pages.forEach((page, pageIdx) => {
    for (const key in page.images) {
      const [srow, scol] = key.split(',').map(Number);
      const img = page.images[key];
      groupSlotPieces(page, key, img).forEach(g => {
        const pieceCols = g.lastCol - g.firstCol + 1;
        const pieceRows = g.lastRow - g.firstRow + 1;
        const widthMm = pieceCols * page.pocketW + (pieceCols - 1) * page.seamH;
        const heightMm = pieceRows * page.pocketH + (pieceRows - 1) * page.seamV;
        let offsetX_mm = 0;
        let offsetY_mm = 0;
        for (let c = scol; c < g.firstCol; c++) { offsetX_mm += page.pocketW + page.seamH; }
        for (let r = srow; r < g.firstRow; r++) { offsetY_mm += page.pocketH + page.seamV; }
        pieces.push({
          pageIdx,
          slotKey: key,
          image: img,
          widthMm, heightMm,
          offsetX_mm, offsetY_mm,
          seamH: page.seamH,
          seamV: page.seamV,
          pocketW: page.pocketW,
          pocketH: page.pocketH,
          pieceCols, pieceRows,
          label: 'P' + (pageIdx + 1) + ' R' + (g.firstRow + 1) + 'C' + (g.firstCol + 1)
        });
      });
    }
  });
  return pieces;
}

// ============================================================
// PRINT SCALE COMPENSATION
// Cancels the printer's own scaling error: the user prints the
// calibration page, measures the two 100 mm bars and enters the
// measured lengths. The print output is then counter-scaled per
// axis. Printer-specific, so stored in localStorage rather than
// in the project file.
// ============================================================
const PRINT_SCALE_KEY = 'michify-print-scale';

function loadPrintScaleUI() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(PRINT_SCALE_KEY)); } catch { /* ignore */ }
  if (saved) {
    if (isFinite(saved.h)) document.getElementById('scale-comp-h').value = saved.h;
    if (isFinite(saved.v)) document.getElementById('scale-comp-v').value = saved.v;
  }
}

function updateScaleCompensation() {
  const h = numInput('scale-comp-h', 100);
  const v = numInput('scale-comp-v', 100);
  document.getElementById('scale-comp-h').value = h;
  document.getElementById('scale-comp-v').value = v;
  try { localStorage.setItem(PRINT_SCALE_KEY, JSON.stringify({ h, v })); } catch { /* ignore */ }
  updatePrintFit();
}

function getScaleCompensation() {
  const h = numInput('scale-comp-h', 100);
  const v = numInput('scale-comp-v', 100);
  return { fx: 100 / h, fy: 100 / v, h, v, active: h !== 100 || v !== 100 };
}

function compPercent(f) {
  const pct = (f - 1) * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

function applyScaleCompensation(sheetDiv) {
  const comp = getScaleCompensation();
  if (!comp.active) return comp;
  sheetDiv.style.transform = 'scale(' + comp.fx + ', ' + comp.fy + ')';
  sheetDiv.style.transformOrigin = 'top left';
  return comp;
}

// ============================================================
// PRINT DIALOG
// ============================================================
function openPrintDialog() {
  document.getElementById('print-modal').classList.add('open');
  updatePrintFit();
}

function closePrintDialog() {
  document.getElementById('print-modal').classList.remove('open');
}

function getPaperDimensions() {
  const size = document.getElementById('paper-size').value;
  const orient = document.getElementById('paper-orient').value;
  const margin = numInput('paper-margin', 5);
  let w, h;
  if (size === 'A4') { w = 210; h = 297; } else { w = 297; h = 420; }
  if (orient === 'landscape') { [w, h] = [h, w]; }
  return { w, h, margin, usableW: w - 2 * margin, usableH: h - 2 * margin, size, orient };
}

function updatePrintFit() {
  const paper = getPaperDimensions();
  const resultEl = document.getElementById('print-fit-result');
  const confirmBtn = document.getElementById('print-confirm');
  const pieces = collectPrintPieces();
  if (pieces.length === 0) {
    resultEl.className = 'fit-result fit-bad';
    resultEl.innerHTML = '<b>Nothing to print</b><br>Add images to at least one page before printing.';
    confirmBtn.disabled = true;
    return;
  }
  let maxSeam = 0;
  state.pages.forEach(page => { maxSeam = Math.max(maxSeam, page.seamH, page.seamV); });
  const gapMm = maxSeam;
  // When compensation enlarges the output, pack into a correspondingly
  // smaller area so the scaled result still fits inside the margins.
  const comp = getScaleCompensation();
  const packW = paper.usableW / Math.max(1, comp.fx);
  const packH = paper.usableH / Math.max(1, comp.fy);
  const result = packPieces(pieces, packW, packH, gapMm);
  if (result.tooLarge) {
    const p = result.tooLarge;
    resultEl.className = 'fit-result fit-bad';
    resultEl.innerHTML = '<b>Image too large for ' + paper.size + ' ' + paper.orient + '</b><br>' +
      p.label + ' is ' + p.widthMm.toFixed(1) + '×' + p.heightMm.toFixed(1) + ' mm which exceeds usable area (' + paper.usableW + '×' + paper.usableH + ' mm).<br><br>' +
      'Try A3, landscape, or smaller margins.';
    confirmBtn.disabled = true;
    return;
  }
  const dpiWarnings = calculateDpiWarnings();
  const sheetCount = result.sheets.length;
  const pieceCount = pieces.length;
  const rotatedCount = result.sheets.reduce((sum, sheet) => sum + sheet.placements.filter(pl => pl.orient.rotated).length, 0);
  resultEl.className = 'fit-result fit-ok';
  let msg = '<b>Ready to print:</b><br>';
  msg += pieceCount + ' image piece' + (pieceCount !== 1 ? 's' : '') + ' fit on ' + sheetCount + ' ' + paper.size + ' ' + paper.orient + ' sheet' + (sheetCount !== 1 ? 's' : '');
  if (rotatedCount > 0) {
    msg += '<br><span style="color:#FFB000">' + rotatedCount + ' piece' + (rotatedCount !== 1 ? 's' : '') + ' auto-rotated to fit</span>';
  }
  msg += '<br><span style="font-size:11px;color:#888">Gap between pieces: ' + gapMm + ' mm (matches largest seam for cutting)</span>';
  if (comp.active) {
    msg += '<br><span style="font-size:11px;color:#888">Scale compensation: H ' + compPercent(comp.fx) + ', V ' + compPercent(comp.fy) + ' (bars measured ' + comp.h + ' / ' + comp.v + ' mm)</span>';
  }
  if (state.cornerMode !== 'none') {
    const modeText = state.cornerMode === 'outer' ? 'outer edges' : 'every card';
    msg += '<br><span style="font-size:11px;color:#888">Corners rounded: ' + state.cornerRadius + ' mm on ' + modeText + '</span>';
  }
  if (dpiWarnings.summary) {
    msg += '<br><br>' + dpiWarnings.summary;
  }
  resultEl.innerHTML = msg;
  if (dpiWarnings.level === 'bad') {
    resultEl.className = 'fit-result fit-bad';
  } else if (dpiWarnings.level === 'warn') {
    resultEl.className = 'fit-result fit-warn';
  }
  confirmBtn.disabled = false;
  window._printResult = result;
  window._printPaper = paper;
  window._printGap = gapMm;
}

function calculateDpiWarnings() {
  const MM_PER_INCH = 25.4;
  const items = [];
  state.pages.forEach((page, pageIdx) => {
    for (const key in page.images) {
      const [srow, scol] = key.split(',').map(Number);
      const img = page.images[key];
      const sw = img.slotW || 1;
      const slotW_mm = sw * page.pocketW + (sw - 1) * page.seamH;
      // Pixels across the footprint width: for 90/270 the natural height
      // runs horizontally on the page.
      const { swapped } = imageFootprint(img);
      const pxAcross = swapped ? img._naturalPxHeight : img._naturalPxWidth;
      if (!pxAcross) { cacheNaturalPixels(img); continue; }
      const visiblePxW = pxAcross * (slotW_mm / img.widthMm);
      const slotW_inch = slotW_mm / MM_PER_INCH;
      const dpi = Math.round(visiblePxW / slotW_inch);
      items.push({
        pageIdx,
        label: 'P' + (pageIdx + 1) + ' R' + (srow + 1) + 'C' + (scol + 1),
        dpi
      });
    }
  });
  if (items.length === 0) return { summary: null, level: 'ok' };
  const minDpi = Math.min(...items.map(i => i.dpi));
  const low = items.filter(i => i.dpi < 250).sort((a, b) => a.dpi - b.dpi);
  let level = 'ok';
  let color = '#47E6C1';
  let icon = '✓';
  let label = 'Excellent print quality';
  if (minDpi < 150) {
    level = 'bad';
    color = '#F43256';
    icon = '⚠';
    label = 'Low print quality';
  } else if (minDpi < 250) {
    level = 'warn';
    color = '#FFB000';
    icon = '⚠';
    label = 'Acceptable print quality';
  }
  let summary = '<b style="color:' + color + '">' + icon + ' ' + label + '</b>';
  summary += '<span style="font-size:11px;color:#888">';
  if (low.length === 0) {
    summary += '<br>Lowest effective resolution: ' + minDpi + ' DPI';
  } else {
    // List every low image at once so the user does not have to fix them
    // one by one to discover the next.
    const MAX_LISTED = 6;
    summary += '<br>' + low.length + ' image' + (low.length !== 1 ? 's' : '') + ' below 250 DPI:';
    low.slice(0, MAX_LISTED).forEach(i => {
      summary += '<br>&nbsp;&nbsp;' + i.label + ' — ' + i.dpi + ' DPI';
    });
    if (low.length > MAX_LISTED) {
      summary += '<br>&nbsp;&nbsp;…and ' + (low.length - MAX_LISTED) + ' more';
    }
    if (level === 'bad') {
      summary += '<br>Images under 150 DPI will look soft or pixelated. Use higher-resolution source images.';
    } else {
      summary += '<br>Print will look decent but not razor-sharp. Consider higher-resolution source images.';
    }
  }
  summary += '</span>';
  return { summary, level };
}

function cacheNaturalPixels(img) {
  if (img._pxMeasureInProgress) return;
  img._pxMeasureInProgress = true;
  const t = new Image();
  t.onload = () => {
    img._naturalPxWidth = t.width;
    img._naturalPxHeight = t.height;
    if (!img._naturalRatio) img._naturalRatio = t.width / t.height;
    img._pxMeasureInProgress = false;
    const modal = document.getElementById('print-modal');
    if (modal && modal.classList.contains('open')) {
      updatePrintFit();
    }
  };
  t.src = img.src;
}

function applyPageStyle(paper) {
  const styleEl = document.createElement('style');
  styleEl.id = 'dynamic-print-style';
  styleEl.textContent = '@page { size: ' + paper.size + ' ' + paper.orient + '; margin: ' + paper.margin + 'mm; }';
  const oldStyle = document.getElementById('dynamic-print-style');
  if (oldStyle) oldStyle.remove();
  document.head.appendChild(styleEl);
}

function confirmPrint() {
  const paper = window._printPaper;
  const result = window._printResult;
  const gapMm = window._printGap;
  if (!paper || !result) { updatePrintFit(); return; }
  applyPageStyle(paper);
  closePrintDialog();
  preparePrint(result, paper, gapMm);
}

function restorePreview() {
  const canvasArea = document.getElementById('canvas-area');
  canvasArea.innerHTML = '<div id="binder-canvas"></div>';
  loadPageToUI();
  renderPagesList();
  renderBinder();
}

function preparePrint(packResult, paper) {
  const canvasArea = document.getElementById('canvas-area');
  const MM_TO_PX = 96 / 25.4;
  canvasArea.innerHTML = '';
  packResult.sheets.forEach((sheet) => {
    const sheetDiv = document.createElement('div');
    sheetDiv.className = 'print-page';
    sheetDiv.style.width = (paper.usableW * MM_TO_PX) + 'px';
    sheetDiv.style.height = (paper.usableH * MM_TO_PX) + 'px';
    sheetDiv.style.background = 'white';
    sheetDiv.style.position = 'relative';
    sheetDiv.style.margin = '0 auto';
    applyScaleCompensation(sheetDiv);
    sheet.placements.forEach(placement => {
      renderPrintPiece(sheetDiv, placement, MM_TO_PX);
    });
    canvasArea.appendChild(sheetDiv);
  });
  setTimeout(() => {
    window.print();
    setTimeout(restorePreview, 500);
  }, 100);
}

function renderPrintPiece(sheetDiv, placement, MM_TO_PX) {
  const piece = placement.piece;
  const orient = placement.orient;
  const outer = document.createElement('div');
  outer.style.position = 'absolute';
  outer.style.left = (placement.x * MM_TO_PX) + 'px';
  outer.style.top = (placement.y * MM_TO_PX) + 'px';
  outer.style.width = (orient.w * MM_TO_PX) + 'px';
  outer.style.height = (orient.h * MM_TO_PX) + 'px';
  outer.style.overflow = 'hidden';
  if (state.cornerMode === 'outer' && state.cornerRadius > 0) {
    outer.style.borderRadius = (state.cornerRadius * MM_TO_PX) + 'px';
  }
  // Inner container lives in the piece's unrotated coordinate space; if the
  // packer rotated the piece onto the sheet, rotate the whole container.
  // This preserves the image's own rotation and crop exactly as previewed.
  const inner = document.createElement('div');
  inner.style.position = 'absolute';
  inner.style.left = '0';
  inner.style.top = '0';
  inner.style.width = (piece.widthMm * MM_TO_PX) + 'px';
  inner.style.height = (piece.heightMm * MM_TO_PX) + 'px';
  if (orient.rotated) {
    inner.style.transform = 'rotate(90deg) translateY(-100%)';
    inner.style.transformOrigin = 'top left';
  }
  const pl = imageElementPlacement(piece.image, piece.offsetX_mm, piece.offsetY_mm);
  const imgEl = document.createElement('img');
  imgEl.src = piece.image.src;
  imgEl.style.position = 'absolute';
  imgEl.style.width = (pl.elWidthMm * MM_TO_PX) + 'px';
  imgEl.style.height = 'auto';
  imgEl.style.left = (pl.leftMm * MM_TO_PX) + 'px';
  imgEl.style.top = (pl.topMm * MM_TO_PX) + 'px';
  imgEl.style.transform = 'rotate(' + pl.rotate + 'deg)';
  imgEl.style.transformOrigin = 'top left';
  inner.appendChild(imgEl);
  if (state.cornerMode === 'every' && state.cornerRadius > 0) {
    renderEveryCornersForPrintPiece(inner, piece, MM_TO_PX);
  }
  outer.appendChild(inner);
  sheetDiv.appendChild(outer);
}

// Corner overlays for 'every card' mode, placed in the piece's unrotated
// coordinate space (the inner container handles sheet rotation).
function renderEveryCornersForPrintPiece(container, piece, MM_TO_PX) {
  const radiusPx = state.cornerRadius * MM_TO_PX;
  for (let r = 0; r < piece.pieceRows; r++) {
    for (let c = 0; c < piece.pieceCols; c++) {
      const x_px = c * (piece.pocketW + piece.seamH) * MM_TO_PX;
      const y_px = r * (piece.pocketH + piece.seamV) * MM_TO_PX;
      const w_px = piece.pocketW * MM_TO_PX;
      const h_px = piece.pocketH * MM_TO_PX;
      addCornerOverlays(container, x_px, y_px, w_px, h_px, radiusPx);
    }
  }
}

// ============================================================
// PRINT CALIBRATION PAGE
// A 100 mm ruler in both directions: if a printed bar does not
// measure exactly 100 mm, the browser/printer is scaling the
// page and every insert would come out the wrong size.
// ============================================================
function printCalibration() {
  const paper = getPaperDimensions();
  applyPageStyle(paper);
  closePrintDialog();
  const canvasArea = document.getElementById('canvas-area');
  const MM_TO_PX = 96 / 25.4;
  canvasArea.innerHTML = '';
  const sheet = document.createElement('div');
  sheet.className = 'print-page';
  sheet.style.width = (paper.usableW * MM_TO_PX) + 'px';
  sheet.style.height = (paper.usableH * MM_TO_PX) + 'px';
  sheet.style.background = 'white';
  sheet.style.position = 'relative';
  sheet.style.margin = '0 auto';
  sheet.style.color = 'black';
  sheet.style.fontFamily = 'sans-serif';
  const comp = applyScaleCompensation(sheet);
  sheet.appendChild(calibrationBar('h', 10, 10, MM_TO_PX));
  sheet.appendChild(calibrationBar('v', 10, 20, MM_TO_PX));
  const note = document.createElement('div');
  note.style.position = 'absolute';
  note.style.left = (35 * MM_TO_PX) + 'px';
  note.style.top = (25 * MM_TO_PX) + 'px';
  note.style.width = (120 * MM_TO_PX) + 'px';
  note.style.fontSize = '12px';
  note.style.lineHeight = '1.5';
  let noteHtml = '<b>Michify print calibration</b><br><br>' +
    'Measure both black bars with a ruler. Each must be exactly <b>100 mm</b> long.<br><br>' +
    'If they are not, your browser or printer is scaling the page: set scale to <b>100%</b> ' +
    'and disable any "fit to page" option in the print dialog, then print this page again.<br><br>' +
    'If the bars are still slightly off at 100% scale, enter their measured lengths in the ' +
    'print dialog\'s scale compensation fields and reprint this page: the bars should then ' +
    'measure exactly 100 mm.';
  if (comp.active) {
    noteHtml += '<br><br><b>Scale compensation is active</b> (measured H ' + comp.h + ' mm, V ' + comp.v + ' mm; ' +
      'applied H ' + compPercent(comp.fx) + ', V ' + compPercent(comp.fy) + '). ' +
      'If both bars now measure 100 mm, the compensation is correct.';
  }
  note.innerHTML = noteHtml;
  sheet.appendChild(note);
  canvasArea.appendChild(sheet);
  setTimeout(() => {
    window.print();
    setTimeout(restorePreview, 500);
  }, 100);
}

function calibrationBar(dir, xMm, yMm, MM_TO_PX) {
  const lengthMm = 100;
  const thicknessMm = 5;
  const borderPx = 2;
  // Built from borders, not background fills: browsers always print borders
  // but skip backgrounds unless "background graphics" is enabled.
  const bar = document.createElement('div');
  bar.style.position = 'absolute';
  bar.style.left = (xMm * MM_TO_PX) + 'px';
  bar.style.top = (yMm * MM_TO_PX) + 'px';
  bar.style.boxSizing = 'border-box';
  bar.style.border = borderPx + 'px solid black';
  bar.style.width = ((dir === 'h' ? lengthMm : thicknessMm) * MM_TO_PX) + 'px';
  bar.style.height = ((dir === 'h' ? thicknessMm : lengthMm) * MM_TO_PX) + 'px';
  for (let mm = 10; mm < lengthMm; mm += 10) {
    const tick = document.createElement('div');
    tick.style.position = 'absolute';
    if (dir === 'h') {
      tick.style.left = (mm * MM_TO_PX - borderPx) + 'px';
      tick.style.top = '0';
      tick.style.width = '0';
      tick.style.height = (2 * MM_TO_PX) + 'px';
      tick.style.borderLeft = '1px solid black';
    } else {
      tick.style.top = (mm * MM_TO_PX - borderPx) + 'px';
      tick.style.left = '0';
      tick.style.height = '0';
      tick.style.width = (2 * MM_TO_PX) + 'px';
      tick.style.borderTop = '1px solid black';
    }
    bar.appendChild(tick);
  }
  const label = document.createElement('div');
  label.textContent = '100 mm';
  label.style.position = 'absolute';
  label.style.fontSize = '10px';
  label.style.whiteSpace = 'nowrap';
  if (dir === 'h') {
    label.style.left = ((lengthMm + 3) * MM_TO_PX) + 'px';
    label.style.top = '-2px';
  } else {
    label.style.top = ((lengthMm + 3) * MM_TO_PX) + 'px';
    label.style.left = '0';
  }
  bar.appendChild(label);
  return bar;
}

// ============================================================
// PNG EXPORT
// Renders the current page to a canvas and downloads it, so a
// design can be shared as an image. The background is transparent
// and cut seams stay empty, giving the same assembled look as the
// print output (continuous seams flow, cut seams are gaps).
// ============================================================
const EXPORT_PX_PER_MM = 8; // ~203 DPI, good for sharing without huge files

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawSlotImageClipped(ctx, imgEl, img, page, scale, clip) {
  const [srow, scol] = [img._row, img._col];
  const originX = (scol * (page.pocketW + page.seamH)) * scale;
  const originY = (srow * (page.pocketH + page.seamV)) * scale;
  const pl = imageElementPlacement(img, 0, 0);
  const ratio = img._naturalRatio || (imgEl.naturalWidth / imgEl.naturalHeight) || 1;
  const wPx = pl.elWidthMm * scale;
  const hPx = wPx / ratio;
  ctx.save();
  clip();
  ctx.translate(originX + pl.leftMm * scale, originY + pl.topMm * scale);
  ctx.rotate(pl.rotate * Math.PI / 180);
  ctx.drawImage(imgEl, 0, 0, wPx, hPx);
  ctx.restore();
}

function renderPageToCanvas(page, imgEls) {
  const scale = EXPORT_PX_PER_MM;
  const pageW = page.cols * page.pocketW + (page.cols - 1) * page.seamH;
  const pageH = page.rows * page.pocketH + (page.rows - 1) * page.seamV;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pageW * scale);
  canvas.height = Math.round(pageH * scale);
  const ctx = canvas.getContext('2d');
  const radiusPx = state.cornerRadius * scale;
  const pocketRectPx = (r, c) => ({
    x: c * (page.pocketW + page.seamH) * scale,
    y: r * (page.pocketH + page.seamV) * scale,
    w: page.pocketW * scale,
    h: page.pocketH * scale
  });
  for (const key in page.images) {
    const img = page.images[key];
    const el = imgEls[key];
    if (!el) continue;
    const [srow, scol] = key.split(',').map(Number);
    img._row = srow; img._col = scol;
    if (state.cornerMode === 'every') {
      // One rounded clip per pocket of the slot
      const sw = img.slotW || 1;
      const sh = img.slotH || 1;
      for (let r = srow; r < srow + sh; r++) {
        for (let c = scol; c < scol + sw; c++) {
          const rect = pocketRectPx(r, c);
          drawSlotImageClipped(ctx, el, img, page, scale, () => {
            if (state.cornerRadius > 0) roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radiusPx);
            else ctx.rect(rect.x, rect.y, rect.w, rect.h);
            ctx.clip();
          });
        }
      }
    } else {
      // One clip per printable piece (respects cut seams)
      groupSlotPieces(page, key, img).forEach(piece => {
        const a = pocketRectPx(piece.firstRow, piece.firstCol);
        const b = pocketRectPx(piece.lastRow, piece.lastCol);
        const rect = { x: a.x, y: a.y, w: (b.x + b.w) - a.x, h: (b.y + b.h) - a.y };
        drawSlotImageClipped(ctx, el, img, page, scale, () => {
          if (state.cornerMode === 'outer' && state.cornerRadius > 0) {
            roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radiusPx);
          } else {
            ctx.rect(rect.x, rect.y, rect.w, rect.h);
          }
          ctx.clip();
        });
      });
    }
  }
  return canvas;
}

function loadImageEls(page) {
  const entries = Object.entries(page.images);
  return Promise.all(entries.map(([key, img]) => new Promise((resolve) => {
    const el = new Image();
    el.onload = () => resolve([key, el]);
    el.onerror = () => resolve([key, null]);
    el.src = img.src;
  }))).then(pairs => Object.fromEntries(pairs));
}

async function exportPagePng() {
  const page = currentPage();
  if (Object.keys(page.images).length === 0) {
    setStatus('Add an image before exporting this page');
    return;
  }
  setStatus('Rendering PNG…');
  try {
    const imgEls = await loadImageEls(page);
    const canvas = renderPageToCanvas(page, imgEls);
    canvas.toBlob((blob) => {
      if (!blob) { setStatus('PNG export failed'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'michify_page_' + (state.currentPage + 1) + '_' + new Date().toISOString().slice(0, 10) + '.png';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Page ' + (state.currentPage + 1) + ' exported as PNG');
    }, 'image/png');
  } catch (err) {
    setStatus('PNG export failed: ' + err.message);
  }
}

// ============================================================
// ABOUT DIALOG
// ============================================================
function openAboutDialog() {
  document.getElementById('about-modal').classList.add('open');
}

function closeAboutDialog() {
  document.getElementById('about-modal').classList.remove('open');
}

// ============================================================
// STATUS AND INFO
// ============================================================
function setStatus(msg) {
  document.getElementById('status-bar').textContent = msg;
  clearTimeout(setStatus._t);
  setStatus._t = setTimeout(() => {
    document.getElementById('status-bar').textContent = 'Click or drag over pockets to select area, then drop image';
  }, 4000);
}

function updatePhysicalInfo() {
  const p = currentPage();
  const info = document.getElementById('physical-info');
  const totalW = p.cols * p.pocketW + (p.cols - 1) * p.seamH;
  const totalH = p.rows * p.pocketH + (p.rows - 1) * p.seamV;
  let text = '<b>One pocket:</b> ' + p.pocketW + ' × ' + p.pocketH + ' mm<br>';
  text += '<b>Full page:</b> ' + totalW.toFixed(1) + ' × ' + totalH.toFixed(1) + ' mm';
  info.innerHTML = text;
}

// ============================================================
// EVENT HANDLERS
// ============================================================
document.addEventListener('wheel', (e) => {
  const inCanvasArea = e.target.closest('#canvas-area');
  if (!inCanvasArea) return;
  if (state.selectedSlot) {
    const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
    const img = currentPage().images[key];
    if (img && e.target.closest('.pocket.has-image, .pocket.selected, .seam-bridge')) {
      const selPocket = e.target.closest('.pocket');
      let overSelected = true;
      if (selPocket) {
        const r = parseInt(selPocket.dataset.row);
        const c = parseInt(selPocket.dataset.col);
        const slot = findSlotAt(currentPage(), r, c);
        if (!slot || slot.row !== state.selectedSlot.row || slot.col !== state.selectedSlot.col) {
          overSelected = false;
        }
      }
      if (overSelected) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -3 : 3;
        zoomImage(delta);
        return;
      }
    }
  }
  if (e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const deltaPercent = e.deltaY > 0 ? -10 : 10;
  zoomView(deltaPercent);
}, { passive: false });

document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (tag === 'SELECT') {
    // A select keeps keyboard focus after being used with the mouse (e.g.
    // the Rotate dropdown), which used to swallow all shortcuts. Let the
    // keys through that have no function inside a select; arrows and
    // typeahead stay native so the select still works with the keyboard.
    const allowed = e.key === 'Delete' || e.key === 'e' || e.key === 'E' || e.ctrlKey || e.metaKey;
    if (!allowed) return;
  }
  const key = state.selectedSlot ? state.selectedSlot.row + ',' + state.selectedSlot.col : null;
  const img = key ? currentPage().images[key] : null;
  if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (e.shiftKey) redoAction();
    else undoAction();
    return;
  }
  if ((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    redoAction();
    return;
  }
  if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
    if (state.selectedSlot) { copyImageSettings(); e.preventDefault(); }
    return;
  }
  // Ctrl+V is handled by the document 'paste' event, which can also read
  // image data from the system clipboard.
  if (e.key === '0' && (e.ctrlKey || e.metaKey)) { resetZoom(); e.preventDefault(); return; }
  if (e.key === '+' || e.key === '=') {
    if (img) zoomImage(3); else zoomView(10);
    e.preventDefault();
    return;
  }
  if (e.key === '-') {
    if (img) zoomImage(-3); else zoomView(-10);
    e.preventDefault();
    return;
  }
  // E: toggle intentional empty (Michi Method)
  if (e.key === 'e' || e.key === 'E') {
    if (state.selectedSlot) { toggleIntentionalEmpty(); e.preventDefault(); }
    return;
  }
  // Delete: remove image OR unmark intentional empty
  if (e.key === 'Delete') {
    if (state.selectedSlot) {
      const p = currentPage();
      const delKey = state.selectedSlot.row + ',' + state.selectedSlot.col;
      if (p.images[delKey]) {
        removeImage();
      } else if (p.emptyPockets && p.emptyPockets.includes(delKey)) {
        pushHistory();
        p.emptyPockets = p.emptyPockets.filter(k => k !== delKey);
        renderBinder();
        setStatus('Intentional empty removed');
      }
      e.preventDefault();
    }
    return;
  }
  if (!img) return;
  const step = e.shiftKey ? 10 : 1;
  let handled = true;
  if (e.key === 'ArrowLeft') { pushHistory('nudge'); img.xMm -= step; }
  else if (e.key === 'ArrowRight') { pushHistory('nudge'); img.xMm += step; }
  else if (e.key === 'ArrowUp') { pushHistory('nudge'); img.yMm -= step; }
  else if (e.key === 'ArrowDown') { pushHistory('nudge'); img.yMm += step; }
  else handled = false;
  if (handled) {
    e.preventDefault();
    clampImage(currentPage(), img);
    refreshSlotImages(key);
    updateProperties();
  }
});

document.addEventListener('paste', (e) => {
  const t = e.target;
  // Pasting has no native function in a SELECT, so only skip real text fields.
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  const cd = e.clipboardData;
  if (!cd) return;
  const text = cd.getData('text/plain') || '';
  const imageFiles = Array.from(cd.files || []).filter(f => f.type.startsWith('image/'));
  if (imageFiles.length > 0 && !text.startsWith(CROP_CLIPBOARD_MARKER)) {
    e.preventDefault();
    if (!state.selectedSlot) {
      setStatus('Select a pocket first, then paste the image');
      return;
    }
    placeImageFiles(imageFiles, state.selectedSlot.row, state.selectedSlot.col);
    return;
  }
  if (state.clipboard && state.selectedSlot) {
    e.preventDefault();
    pasteImageSettings();
  }
});

document.addEventListener('mousedown', (e) => {
  const pocket = e.target.closest('.pocket');
  if (!pocket) return;
  const r = parseInt(pocket.dataset.row);
  const c = parseInt(pocket.dataset.col);
  const slot = findSlotAt(currentPage(), r, c);
  if (!slot) return;
  // If Alt-key is held, the pocket mousedown already handles it, skip document-level pan
  if (e.altKey) return;
  if (!state.selectedSlot || state.selectedSlot.row !== slot.row || state.selectedSlot.col !== slot.col) return;
  const img = currentPage().images[slot.key];
  if (!img) return;
  dragging = { startX: e.clientX, startY: e.clientY, imgX: img.xMm, imgY: img.yMm, key: slot.key, pushed: false };
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const img = currentPage().images[dragging.key];
  if (!img) return;
  if (!dragging.pushed) {
    pushHistory();
    dragging.pushed = true;
  }
  const dx = (e.clientX - dragging.startX) / state.viewScale;
  const dy = (e.clientY - dragging.startY) / state.viewScale;
  img.xMm = dragging.imgX + dx;
  img.yMm = dragging.imgY + dy;
  clampImage(currentPage(), img);
  refreshSlotImages(dragging.key);
  updateProperties();
});

document.addEventListener('mouseup', (e) => {
  if (movingImage) {
    const pocket = e.target.closest('.pocket');
    if (pocket) {
      const r = parseInt(pocket.dataset.row);
      const c = parseInt(pocket.dataset.col);
      moveOrSwapImage(movingImage.fromRow, movingImage.fromCol, r, c);
    }
    document.querySelectorAll('.pocket.move-target').forEach(el => el.classList.remove('move-target'));
    movingImage = null;
  }
  if (rangeSelecting) {
    const startR = Math.min(rangeSelecting.startRow, rangeSelecting.currentRow);
    const startC = Math.min(rangeSelecting.startCol, rangeSelecting.currentCol);
    const endR = Math.max(rangeSelecting.startRow, rangeSelecting.currentRow);
    const endC = Math.max(rangeSelecting.startCol, rangeSelecting.currentCol);
    if (startR !== endR || startC !== endC) {
      setRangeSelection(startR, startC, endR, endC);
    }
    rangeSelecting = null;
  }
  if (dragging) {
    setTimeout(() => { dragging = null; }, 50);
  }
});

// ============================================================
// TOUCH SUPPORT
// Unifies tablet interaction with the mouse handlers above:
//   one finger  -> tap to select, drag to pan the image or
//                  rubber-band a pocket area, long-press for menu
//   two fingers -> pinch to zoom (the image if the gesture is
//                  over the selected slot, otherwise the view)
// touchstart is preventDefaulted so the browser does not also
// fire synthetic mouse events we would double-handle.
// ============================================================
const TOUCH_MOVE_THRESHOLD = 8; // px before a tap becomes a drag
const LONG_PRESS_MS = 500;
let touch = null;      // single-finger gesture state
let pinch = null;      // two-finger gesture state
let longPressTimer = null;

function pocketAtPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('.pocket') : null;
}

function touchDist(t0, t1) {
  return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
}

function clearLongPress() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
}

function endSingleTouch() {
  clearLongPress();
  if (touch && touch.mode === 'range' && rangeSelecting) {
    const startR = Math.min(rangeSelecting.startRow, rangeSelecting.currentRow);
    const startC = Math.min(rangeSelecting.startCol, rangeSelecting.currentCol);
    const endR = Math.max(rangeSelecting.startRow, rangeSelecting.currentRow);
    const endC = Math.max(rangeSelecting.startCol, rangeSelecting.currentCol);
    if (startR !== endR || startC !== endC) setRangeSelection(startR, startC, endR, endC);
    rangeSelecting = null;
  }
  touch = null;
}

function startPinch(touches) {
  clearLongPress();
  touch = null; // cancel any single-finger gesture
  rangeSelecting = null;
  const midX = (touches[0].clientX + touches[1].clientX) / 2;
  const midY = (touches[0].clientY + touches[1].clientY) / 2;
  let target = 'view';
  if (state.selectedSlot) {
    const pk = pocketAtPoint(midX, midY);
    if (pk) {
      const slot = findSlotAt(currentPage(), parseInt(pk.dataset.row), parseInt(pk.dataset.col));
      if (slot && slot.row === state.selectedSlot.row && slot.col === state.selectedSlot.col) target = 'image';
    }
  }
  pinch = { lastDist: touchDist(touches[0], touches[1]), target };
}

const canvasArea = document.getElementById('canvas-area');

canvasArea.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    startPinch(e.touches);
    return;
  }
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  const pk = pocketAtPoint(t.clientX, t.clientY);
  if (!pk) return;
  e.preventDefault();
  const r = parseInt(pk.dataset.row);
  const c = parseInt(pk.dataset.col);
  const slot = findSlotAt(currentPage(), r, c);
  touch = { startX: t.clientX, startY: t.clientY, row: r, col: c, moved: false };
  if (slot) {
    // Select and arm a pan of this slot's image
    selectAt(slot.row, slot.col);
    const img = currentPage().images[slot.key];
    touch.mode = 'pan-armed';
    touch.key = slot.key;
    touch.imgX = img.xMm;
    touch.imgY = img.yMm;
    touch.pushed = false;
  } else {
    touch.mode = 'empty-armed';
  }
  // Long-press opens the context menu at the touch point
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    if (!touch || touch.moved) return;
    const s = findSlotAt(currentPage(), r, c);
    if (s) selectAt(s.row, s.col); else selectAt(r, c);
    showContextMenu({ clientX: t.clientX, clientY: t.clientY, preventDefault() {} }, { row: r, col: c });
    touch = null;
  }, LONG_PRESS_MS);
}, { passive: false });

canvasArea.addEventListener('touchmove', (e) => {
  if (pinch && e.touches.length === 2) {
    e.preventDefault();
    const dist = touchDist(e.touches[0], e.touches[1]);
    if (pinch.lastDist > 0) {
      const ratio = dist / pinch.lastDist;
      if (pinch.target === 'image' && state.selectedSlot) {
        const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
        const img = currentPage().images[key];
        if (img) zoomImage(img.widthMm * (ratio - 1));
      } else {
        const input = document.getElementById('view-scale');
        const cur = parseInt(input.value) || 100;
        zoomView(Math.round(cur * (ratio - 1)));
      }
    }
    pinch.lastDist = dist;
    return;
  }
  if (!touch || e.touches.length !== 1) return;
  const t = e.touches[0];
  const dx = t.clientX - touch.startX;
  const dy = t.clientY - touch.startY;
  if (!touch.moved && Math.hypot(dx, dy) < TOUCH_MOVE_THRESHOLD) return;
  touch.moved = true;
  clearLongPress();
  e.preventDefault();
  if (touch.mode === 'pan-armed' || touch.mode === 'pan') {
    touch.mode = 'pan';
    const img = currentPage().images[touch.key];
    if (!img) return;
    if (!touch.pushed) { pushHistory(); touch.pushed = true; }
    img.xMm = touch.imgX + dx / state.viewScale;
    img.yMm = touch.imgY + dy / state.viewScale;
    clampImage(currentPage(), img);
    refreshSlotImages(touch.key);
    updateProperties();
  } else if (touch.mode === 'empty-armed' || touch.mode === 'range') {
    touch.mode = 'range';
    if (!rangeSelecting) rangeSelecting = { startRow: touch.row, startCol: touch.col, currentRow: touch.row, currentCol: touch.col };
    const pk = pocketAtPoint(t.clientX, t.clientY);
    if (pk) {
      rangeSelecting.currentRow = parseInt(pk.dataset.row);
      rangeSelecting.currentCol = parseInt(pk.dataset.col);
      updateRangeSelectionPreview();
    }
  }
}, { passive: false });

canvasArea.addEventListener('touchend', (e) => {
  if (pinch) {
    if (e.touches.length < 2) pinch = null;
    return;
  }
  if (!touch) return;
  if (!touch.moved) {
    // A tap: selection already happened for slots; select empties now
    clearLongPress();
    if (touch.mode === 'empty-armed') selectAt(touch.row, touch.col);
    touch = null;
    return;
  }
  endSingleTouch();
}, { passive: false });

canvasArea.addEventListener('touchcancel', () => {
  clearLongPress();
  touch = null;
  pinch = null;
  rangeSelecting = null;
});

// ============================================================
// GLOBALS FOR INLINE HTML HANDLERS
// ============================================================
Object.assign(window, {
  newProject, saveProject, loadProject,
  openAboutDialog, closeAboutDialog,
  openPrintDialog, closePrintDialog, confirmPrint, printCalibration, updatePrintFit, updateScaleCompensation,
  addPage, duplicatePage,
  updateBinder, zoomView, resetZoom,
  setAllSeams, updateCorners, updateImageQuality,
  resizeSlot, toggleIntentionalEmpty, updateImageProps,
  zoomImage, autoFitCover, removeImage,
  copyImageSettings, pasteImageSettings, expandSlot, trimSlot,
  addImagesFromInput, undoAction, redoAction,
  toggleSection, updateHintsVisibility,
  applyBinderPreset, zoomToFit, exportPagePng
});

// Internal hooks for the e2e harness only.
window.__test = { renderPageToCanvas, loadImageEls, movePage, switchPage, state, currentPage };

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
  onDirty(queueAutosave);
  populateBinderPresets();
  loadPrintScaleUI();
  loadHintsUI();
  applySectionStates();
  // Render the default UI immediately; offer the autosave restore after.
  loadPageToUI();
  renderPagesList();
  renderBinder();
  updatePhysicalInfo();
  updateClipboardIndicator();
  try {
    const auto = await loadAutosave();
    if (auto && projectHasContent(auto)) {
      const when = auto.savedAt ? new Date(auto.savedAt).toLocaleString() : 'an earlier session';
      if (confirm('Restore your autosaved work from ' + when + '?')) {
        applyProjectData(auto);
        setStatus('Session restored from autosave');
      } else {
        clearAutosave().catch(() => {});
      }
    }
  } catch (err) {
    // IndexedDB unavailable (e.g. private browsing) - autosave disabled.
  }
}

init();
