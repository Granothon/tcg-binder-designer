/*
  Michify - TCG Binder Designer
  Application logic
  Copyright (c) 2026 Risto Ruuskanen
  Licensed under the MIT License
*/

// ============================================================
// STATE
// ============================================================
let state = {
  pages: [createEmptyPage()],
  currentPage: 0,
  selectedSlot: null,
  rangeSelection: null,
  viewScale: 3,
  clipboard: null,
  cornerMode: 'none',       // 'none' | 'outer' | 'every'
  cornerRadius: 3.18           // mm
};

let rangeSelecting = null;
let dragging = null;

function createEmptyPage() {
  return {
    rows: 3,
    cols: 3,
    pocketW: 68,
    pocketH: 93,
    seamH: 2,
    seamV: 2,
    seamsH: ['cut', 'continuous'],
    seamsV: ['cut', 'cut'],
    images: {}
  };
}

function currentPage() {
  return state.pages[state.currentPage];
}

// ============================================================
// SLOT LOGIC
// ============================================================
function findSlotAt(row, col) {
  const p = currentPage();
  for (const key in p.images) {
    const img = p.images[key];
    const [r, c] = key.split(',').map(Number);
    const w = img.slotW || 1;
    const h = img.slotH || 1;
    if (row >= r && row < r + h && col >= c && col < c + w) {
      return { key, row: r, col: c, image: img };
    }
  }
  return null;
}

function isAreaFree(row, col, w, h, ignoreKey) {
  const p = currentPage();
  if (row + h > p.rows || col + w > p.cols) return false;
  if (row < 0 || col < 0) return false;
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) {
      const slot = findSlotAt(r, c);
      if (slot && slot.key !== ignoreKey) return false;
    }
  }
  return true;
}

function slotSizeMm(sw, sh) {
  const p = currentPage();
  return {
    w: sw * p.pocketW + (sw - 1) * p.seamH,
    h: sh * p.pocketH + (sh - 1) * p.seamV
  };
}

function mmToPx(mm) {
  return mm * state.viewScale;
}

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

function clampImage(imgData) {
  const sw = imgData.slotW || 1;
  const sh = imgData.slotH || 1;
  const slotSize = slotSizeMm(sw, sh);
  const naturalRatio = imgData._naturalRatio || 1;
  const minWidthByW = slotSize.w;
  const minWidthByH = slotSize.h * naturalRatio;
  const minWidth = Math.max(minWidthByW, minWidthByH);
  if (imgData.widthMm < minWidth) imgData.widthMm = minWidth;
  const imgW = imgData.widthMm;
  const imgH = imgW / naturalRatio;
  const minX = slotSize.w - imgW;
  const maxX = 0;
  if (imgW <= slotSize.w) {
    imgData.xMm = 0;
  } else {
    if (imgData.xMm > maxX) imgData.xMm = maxX;
    if (imgData.xMm < minX) imgData.xMm = minX;
  }
  const minY = slotSize.h - imgH;
  const maxY = 0;
  if (imgH <= slotSize.h) {
    imgData.yMm = 0;
  } else {
    if (imgData.yMm > maxY) imgData.yMm = maxY;
    if (imgData.yMm < minY) imgData.yMm = minY;
  }
}

// ============================================================
// CORNER LOGIC
// ============================================================
function updateCorners() {
  state.cornerMode = document.getElementById('corner-mode').value;
  state.cornerRadius = parseFloat(document.getElementById('corner-radius').value) || 3.18;
  
  // Show/hide radius field based on mode
  const radiusField = document.getElementById('corner-radius-field');
  if (state.cornerMode === 'none') {
    radiusField.classList.add('hidden');
  } else {
    radiusField.classList.remove('hidden');
  }
  
  renderBinder();
}

// Collect image "pieces" - contiguous rectangles bounded by cut seams
// This is used for corner rounding in 'outer' mode
function collectImagePieces(pageParam) {
  const page = pageParam || currentPage();
  const pieces = [];
  
  for (const key in page.images) {
    const [srow, scol] = key.split(',').map(Number);
    const img = page.images[key];
    const sw = img.slotW || 1;
    const sh = img.slotH || 1;

    // Split by cut seams horizontally
    const colGroups = [];
    let currentGroup = [scol];
    for (let c = scol; c < scol + sw - 1; c++) {
      if (page.seamsH[c] === 'cut') {
        colGroups.push(currentGroup);
        currentGroup = [c + 1];
      } else {
        currentGroup.push(c + 1);
      }
    }
    colGroups.push(currentGroup);

    // Split by cut seams vertically
    const rowGroups = [];
    let currentRowGroup = [srow];
    for (let r = srow; r < srow + sh - 1; r++) {
      if (page.seamsV[r] === 'cut') {
        rowGroups.push(currentRowGroup);
        currentRowGroup = [r + 1];
      } else {
        currentRowGroup.push(r + 1);
      }
    }
    rowGroups.push(currentRowGroup);

    rowGroups.forEach(rowGroup => {
      colGroups.forEach(colGroup => {
        const firstCol = colGroup[0];
        const lastCol = colGroup[colGroup.length - 1];
        const firstRow = rowGroup[0];
        const lastRow = rowGroup[rowGroup.length - 1];
        
        pieces.push({
          slotKey: key,
          slotOriginRow: srow,
          slotOriginCol: scol,
          firstRow, lastRow,
          firstCol, lastCol,
          image: img
        });
      });
    });
  }
  return pieces;
}

// Render corner overlays for pieces (outer mode) or pockets (every mode)
function renderCornerOverlays(canvas) {
  if (state.cornerMode === 'none') return;
  
  const page = currentPage();
  const radiusMm = state.cornerRadius;
  const radiusPx = mmToPx(radiusMm);
  
  if (state.cornerMode === 'every') {
    // Round every pocket that has an image
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
    // Round only the outer corners of each piece
    const pieces = collectImagePieces(page);
    pieces.forEach(piece => {
      const startPos = pocketPos(piece.firstRow, piece.firstCol);
      const endPos = pocketPos(piece.lastRow, piece.lastCol);
      const x = startPos.x;
      const y = startPos.y;
      const w = (endPos.x + endPos.w) - startPos.x;
      const h = (endPos.y + endPos.h) - startPos.y;
      addCornerOverlays(canvas, x, y, w, h, radiusPx);
    });
  }
}

// Add 4 corner overlay elements at the corners of a rectangle
function addCornerOverlays(canvas, x, y, w, h, radiusPx) {
  const corners = [
    { cls: 'tl', dx: 0, dy: 0 },
    { cls: 'tr', dx: w - radiusPx, dy: 0 },
    { cls: 'bl', dx: 0, dy: h - radiusPx },
    { cls: 'br', dx: w - radiusPx, dy: h - radiusPx }
  ];
  
  corners.forEach(corner => {
    const overlay = document.createElement('div');
    overlay.className = 'corner-overlay ' + corner.cls;
    overlay.style.left = (x + corner.dx) + 'px';
    overlay.style.top = (y + corner.dy) + 'px';
    overlay.style.width = radiusPx + 'px';
    overlay.style.height = radiusPx + 'px';
    canvas.appendChild(overlay);
  });
}

// ============================================================
// BINDER UPDATE
// ============================================================
function updateBinder() {
  const p = currentPage();
  p.rows = parseInt(document.getElementById('rows').value);
  p.cols = parseInt(document.getElementById('cols').value);
  p.pocketW = parseFloat(document.getElementById('pocket-w').value);
  p.pocketH = parseFloat(document.getElementById('pocket-h').value);
  p.seamH = parseFloat(document.getElementById('seam-h').value);
  p.seamV = parseFloat(document.getElementById('seam-v').value);
  while (p.seamsH.length < p.cols - 1) p.seamsH.push('cut');
  while (p.seamsH.length > p.cols - 1) p.seamsH.pop();
  while (p.seamsV.length < p.rows - 1) p.seamsV.push('cut');
  while (p.seamsV.length > p.rows - 1) p.seamsV.pop();
  state.viewScale = parseInt(document.getElementById('view-scale').value) / 100 * 3;
  renderBinder();
  renderPagesList();
  updatePhysicalInfo();
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
// RENDER
// ============================================================
function renderPocketImagePart(pocketEl, imgData, slotOriginRow, slotOriginCol, pocketRow, pocketCol) {
  const p = currentPage();
  let offsetX_mm = 0;
  let offsetY_mm = 0;
  for (let c = slotOriginCol; c < pocketCol; c++) {
    offsetX_mm += p.pocketW + p.seamH;
  }
  for (let r = slotOriginRow; r < pocketRow; r++) {
    offsetY_mm += p.pocketH + p.seamV;
  }
  const imgEl = document.createElement('img');
  imgEl.src = imgData.src;
  imgEl.style.width = mmToPx(imgData.widthMm) + 'px';
  imgEl.style.height = 'auto';
  imgEl.style.left = mmToPx(imgData.xMm - offsetX_mm) + 'px';
  imgEl.style.top = mmToPx(imgData.yMm - offsetY_mm) + 'px';
  imgEl.style.transform = 'rotate(' + imgData.rotate + 'deg)';
  imgEl.style.transformOrigin = 'top left';
  pocketEl.appendChild(imgEl);
}

function renderContinuousSeamBridge(canvas, imgData, slotOriginRow, slotOriginCol, seamRow, seamCol, direction) {
  const p = currentPage();
  const scale = state.viewScale;
  const bridge = document.createElement('div');
  bridge.className = 'seam-bridge';
  if (direction === 'h') {
    const seamX_px = ((seamCol + 1) * p.pocketW + seamCol * p.seamH) * scale;
    const seamY_px = seamRow * (p.pocketH + p.seamV) * scale;
    bridge.style.left = seamX_px + 'px';
    bridge.style.top = seamY_px + 'px';
    bridge.style.width = mmToPx(p.seamH) + 'px';
    bridge.style.height = mmToPx(p.pocketH) + 'px';
    let offsetX_mm = 0;
    for (let c = slotOriginCol; c <= seamCol; c++) {
      offsetX_mm += p.pocketW;
      if (c < seamCol) offsetX_mm += p.seamH;
    }
    let offsetY_mm = 0;
    for (let r = slotOriginRow; r < seamRow; r++) {
      offsetY_mm += p.pocketH + p.seamV;
    }
    const imgEl = document.createElement('img');
    imgEl.src = imgData.src;
    imgEl.style.width = mmToPx(imgData.widthMm) + 'px';
    imgEl.style.height = 'auto';
    imgEl.style.left = mmToPx(imgData.xMm - offsetX_mm) + 'px';
    imgEl.style.top = mmToPx(imgData.yMm - offsetY_mm) + 'px';
    imgEl.style.transform = 'rotate(' + imgData.rotate + 'deg)';
    imgEl.style.transformOrigin = 'top left';
    bridge.appendChild(imgEl);
  } else {
    const seamX_px = seamCol * (p.pocketW + p.seamH) * scale;
    const seamY_px = ((seamRow + 1) * p.pocketH + seamRow * p.seamV) * scale;
    bridge.style.left = seamX_px + 'px';
    bridge.style.top = seamY_px + 'px';
    bridge.style.width = mmToPx(p.pocketW) + 'px';
    bridge.style.height = mmToPx(p.seamV) + 'px';
    let offsetX_mm = 0;
    for (let c = slotOriginCol; c < seamCol; c++) {
      offsetX_mm += p.pocketW + p.seamH;
    }
    let offsetY_mm = 0;
    for (let r = slotOriginRow; r <= seamRow; r++) {
      offsetY_mm += p.pocketH;
      if (r < seamRow) offsetY_mm += p.seamV;
    }
    const imgEl = document.createElement('img');
    imgEl.src = imgData.src;
    imgEl.style.width = mmToPx(imgData.widthMm) + 'px';
    imgEl.style.height = 'auto';
    imgEl.style.left = mmToPx(imgData.xMm - offsetX_mm) + 'px';
    imgEl.style.top = mmToPx(imgData.yMm - offsetY_mm) + 'px';
    imgEl.style.transform = 'rotate(' + imgData.rotate + 'deg)';
    imgEl.style.transformOrigin = 'top left';
    bridge.appendChild(imgEl);
  }
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
      const slot = findSlotAt(row, col);
      if (slot) {
        pocket.classList.add('has-image');
        if (slot.row !== row || slot.col !== col) {
          pocket.classList.add('in-multi-slot');
        }
        renderPocketImagePart(pocket, slot.image, slot.row, slot.col, row, col);
      } else {
        const idx = document.createElement('div');
        idx.className = 'pocket-index';
        idx.textContent = 'R' + (row + 1) + 'C' + (col + 1);
        pocket.appendChild(idx);
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
      });
      pocket.addEventListener('click', (e) => {
        if (dragging) return;
        if (e.shiftKey) return;
        if (!rangeSelecting || (rangeSelecting.startRow === row && rangeSelecting.startCol === col)) {
          if (slot) selectAt(slot.row, slot.col);
          else selectAt(row, col);
        }
      });
      pocket.addEventListener('dragover', (e) => {
        e.preventDefault();
        pocket.classList.add('drag-over');
      });
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
          renderContinuousSeamBridge(canvas, img, srow, scol, r, c, 'h');
        }
      }
    }
    for (let r = srow; r < srow + sh - 1; r++) {
      if (p.seamsV[r] === 'continuous') {
        for (let c = scol; c < scol + sw; c++) {
          renderContinuousSeamBridge(canvas, img, srow, scol, r, c, 'v');
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

  // Render corner overlays for rounded corners (outer or every mode)
  renderCornerOverlays(canvas);

  // Selected slot outline (on top of everything)
  if (state.selectedSlot) {
    const { row, col } = state.selectedSlot;
    const key = row + ',' + col;
    const img = p.images[key];
    if (img) {
      const sw = img.slotW || 1;
      const sh = img.slotH || 1;
      const startPos = pocketPos(row, col);
      const outline = document.createElement('div');
      outline.className = 'slot-outline';
      outline.style.left = startPos.x + 'px';
      outline.style.top = startPos.y + 'px';
      outline.style.width = mmToPx(slotSizeMm(sw, sh).w) + 'px';
      outline.style.height = mmToPx(slotSizeMm(sw, sh).h) + 'px';
      canvas.appendChild(outline);
    }
  }

  // Seam toggle buttons
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
      seam.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSeam('h', s);
      });
      canvas.appendChild(seam);
    }
  }
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
      seam.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSeam('v', s);
      });
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
  if (!isAreaFree(startRow, startCol, w, h, null)) {
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
  const slot = findSlotAt(row, col);
  if (slot) state.selectedSlot = { row: slot.row, col: slot.col };
  else state.selectedSlot = { row, col };
  state.rangeSelection = null;
  renderBinder();
}

function toggleSeam(dir, idx) {
  const p = currentPage();
  const arr = dir === 'h' ? p.seamsH : p.seamsV;
  arr[idx] = arr[idx] === 'cut' ? 'continuous' : 'cut';
  renderBinder();
  updatePhysicalInfo();
}

function setAllSeams(type) {
  const p = currentPage();
  p.seamsH = p.seamsH.map(() => type);
  p.seamsV = p.seamsV.map(() => type);
  renderBinder();
  updatePhysicalInfo();
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
    const slotMm = slotSizeMm(sw, sh);
    props.innerHTML =
      '<div style="font-size:13px">Image: R' + (row + 1) + 'C' + (col + 1) + '</div>' +
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
    if (state.rangeSelection) {
      const rs = state.rangeSelection;
      const w = rs.endCol - rs.startCol + 1;
      const h = rs.endRow - rs.startRow + 1;
      extra = '<div style="font-size:11px;color:#FFB000;margin-top:4px">Area selected: ' + w + 'x' + h + '. Drop image or paste crop.</div>';
    } else {
      extra = '<div style="font-size:11px;color:#888;margin-top:4px">Set slot size and drop image</div>';
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
  const newW = parseInt(document.getElementById('slot-w').value);
  const newH = parseInt(document.getElementById('slot-h').value);
  if (!isAreaFree(row, col, newW, newH, key)) {
    setStatus('Area does not fit or is occupied');
    if (img) {
      document.getElementById('slot-w').value = img.slotW || 1;
      document.getElementById('slot-h').value = img.slotH || 1;
    }
    return;
  }
  if (img) {
    img.slotW = newW;
    img.slotH = newH;
    clampImage(img);
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
  img.widthMm = parseFloat(document.getElementById('img-width-mm').value);
  img.xMm = parseFloat(document.getElementById('img-x-mm').value);
  img.yMm = parseFloat(document.getElementById('img-y-mm').value);
  img.rotate = parseInt(document.getElementById('img-rotate').value);
  clampImage(img);
  renderBinder();
}

function zoomImage(deltaMm) {
  if (!state.selectedSlot) return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  const img = currentPage().images[key];
  if (!img) return;
  const slot = slotSizeMm(img.slotW || 1, img.slotH || 1);
  const centerX = -img.xMm + slot.w / 2;
  const centerY = -img.yMm + slot.h / 2;
  const oldW = img.widthMm;
  const newW = Math.max(10, Math.min(2000, oldW + deltaMm));
  const ratio = newW / oldW;
  img.widthMm = newW;
  img.xMm = -(centerX * ratio - slot.w / 2);
  img.yMm = -(centerY * ratio - slot.h / 2);
  clampImage(img);
  renderBinder();
  updateProperties();
}

function autoFitCover() {
  if (!state.selectedSlot) return;
  autoFitImage(state.selectedSlot.row, state.selectedSlot.col);
}

function removeImage() {
  if (!state.selectedSlot) return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  delete currentPage().images[key];
  renderBinder();
  setStatus('Image removed');
}

function copyImageSettings() {
  if (!state.selectedSlot) return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  const img = currentPage().images[key];
  if (!img) return;
  state.clipboard = {
    widthMm: img.widthMm,
    xMm: img.xMm,
    yMm: img.yMm,
    rotate: img.rotate,
    src: img.src,
    _naturalRatio: img._naturalRatio
  };
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
    sw = parseInt(document.getElementById('slot-w').value) || 1;
    sh = parseInt(document.getElementById('slot-h').value) || 1;
    if (!isAreaFree(row, col, sw, sh, null)) { sw = 1; sh = 1; }
  }
  p.images[key] = {
    src: cb.src,
    widthMm: cb.widthMm,
    xMm: cb.xMm,
    yMm: cb.yMm,
    rotate: cb.rotate,
    _naturalRatio: cb._naturalRatio,
    slotW: sw,
    slotH: sh
  };
  clampImage(p.images[key]);
  state.rangeSelection = null;
  renderBinder();
  setStatus('Crop pasted (' + cb.widthMm.toFixed(1) + ' mm)');
}

function duplicateToNeighbor(dir) {
  if (!state.selectedSlot) return;
  const { row, col } = state.selectedSlot;
  const key = row + ',' + col;
  const p = currentPage();
  const src = p.images[key];
  if (!src) return;
  const sw = src.slotW || 1;
  const sh = src.slotH || 1;
  let newRow = row, newCol = col;
  let xShift = 0, yShift = 0;
  const slotMm = slotSizeMm(sw, sh);
  if (dir === 'right') { newCol = col + sw; xShift = -(slotMm.w + p.seamH); }
  else if (dir === 'left') { newCol = col - sw; xShift = slotMm.w + p.seamH; }
  else if (dir === 'down') { newRow = row + sh; yShift = -(slotMm.h + p.seamV); }
  else if (dir === 'up') { newRow = row - sh; yShift = slotMm.h + p.seamV; }
  if (!isAreaFree(newRow, newCol, sw, sh, null)) {
    setStatus('Neighbor area does not fit or is occupied');
    return;
  }
  const newKey = newRow + ',' + newCol;
  p.images[newKey] = {
    src: src.src,
    widthMm: src.widthMm,
    xMm: src.xMm + xShift,
    yMm: src.yMm + yShift,
    rotate: src.rotate,
    _naturalRatio: src._naturalRatio,
    slotW: sw,
    slotH: sh
  };
  clampImage(p.images[newKey]);
  state.selectedSlot = { row: newRow, col: newCol };
  renderBinder();
  setStatus('Duplicated ' + dir);
}

function handleDrop(e, row, col) {
  const files = e.dataTransfer.files;
  if (files.length === 0) return;
  const file = files[0];
  if (!file.type.startsWith('image/')) {
    setStatus('Only image files');
    return;
  }
  const existingSlot = findSlotAt(row, col);
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
      sw = parseInt(document.getElementById('slot-w').value) || 1;
      sh = parseInt(document.getElementById('slot-h').value) || 1;
      if (!isAreaFree(row, col, sw, sh, null)) { sw = 1; sh = 1; }
    }
    state.rangeSelection = null;
  } else if (existingSlot) {
    sw = existingSlot.image.slotW || 1;
    sh = existingSlot.image.slotH || 1;
  } else if (state.selectedSlot && state.selectedSlot.row === row && state.selectedSlot.col === col) {
    sw = parseInt(document.getElementById('slot-w').value);
    sh = parseInt(document.getElementById('slot-h').value);
    if (!isAreaFree(row, col, sw, sh, null)) { sw = 1; sh = 1; }
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const key = targetRow + ',' + targetCol;
    currentPage().images[key] = {
      src: ev.target.result,
      widthMm: 100,
      xMm: 0,
      yMm: 0,
      rotate: 0,
      slotW: sw,
      slotH: sh
    };
    autoFitImage(targetRow, targetCol);
    state.selectedSlot = { row: targetRow, col: targetCol };
    setStatus('Image added at R' + (targetRow + 1) + 'C' + (targetCol + 1) + ' (' + sw + 'x' + sh + ')');
  };
  reader.readAsDataURL(file);
}

function autoFitImage(row, col) {
  const p = currentPage();
  const key = row + ',' + col;
  const d = p.images[key];
  if (!d) return;
  const sw = d.slotW || 1;
  const sh = d.slotH || 1;
  const slot = slotSizeMm(sw, sh);
  const tempImg = new Image();
  tempImg.onload = () => {
    const naturalRatio = tempImg.width / tempImg.height;
    d._naturalRatio = naturalRatio;
    const slotRatio = slot.w / slot.h;
    if (naturalRatio > slotRatio) {
      d.widthMm = slot.h * naturalRatio;
      d.xMm = -(d.widthMm - slot.w) / 2;
      d.yMm = 0;
    } else {
      d.widthMm = slot.w;
      d.xMm = 0;
      const imgH = d.widthMm / naturalRatio;
      d.yMm = -(imgH - slot.h) / 2;
    }
    clampImage(d);
    renderBinder();
  };
  tempImg.src = d.src;
}

// ============================================================
// PAGES MANAGEMENT
// ============================================================
function renderPagesList() {
  const list = document.getElementById('pages-list');
  list.innerHTML = '';
  state.pages.forEach((page, i) => {
    const item = document.createElement('div');
    item.className = 'page-item' + (i === state.currentPage ? ' active' : '');
    const label = document.createElement('span');
    label.textContent = 'Page ' + (i + 1) + ' (' + page.rows + 'x' + page.cols + ')';
    item.appendChild(label);
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePage(i);
    });
    item.appendChild(del);
    item.addEventListener('click', () => switchPage(i));
    list.appendChild(item);
  });
}

function addPage() {
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
  const copy = JSON.parse(JSON.stringify(currentPage()));
  state.pages.splice(state.currentPage + 1, 0, copy);
  state.currentPage++;
  loadPageToUI();
  renderPagesList();
  renderBinder();
}

function deletePage(i) {
  if (state.pages.length === 1) return;
  if (!confirm('Delete page ' + (i + 1) + '?')) return;
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
}

// ============================================================
// PROJECT SAVE/LOAD
// ============================================================
function saveProject() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'michify_project_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Project saved');
}

function loadProject(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.pages || !Array.isArray(data.pages)) throw new Error('Invalid file');
      state = data;
      state.selectedSlot = null;
      state.rangeSelection = null;
      state.currentPage = Math.min(state.currentPage || 0, state.pages.length - 1);
      // Backwards compatibility for cornerMode
      if (state.cornerMode === undefined) state.cornerMode = 'none';
      if (state.cornerRadius === undefined) state.cornerRadius = 3.18;
      state.pages.forEach(page => {
        for (const key in page.images) {
          const img = page.images[key];
          if (!img.slotW) img.slotW = 1;
          if (!img.slotH) img.slotH = 1;
          if (img.widthMm === undefined && img.scale !== undefined) {
            const oldViewScale = state.viewScale || 3;
            const slot = slotSizeMm(img.slotW, img.slotH);
            img.widthMm = slot.w * img.scale;
            img.xMm = (img.x || 0) / oldViewScale;
            img.yMm = (img.y || 0) / oldViewScale;
            delete img.scale;
            delete img.x;
            delete img.y;
          }
        }
      });
      loadPageToUI();
      document.getElementById('corner-mode').value = state.cornerMode;
      document.getElementById('corner-radius').value = state.cornerRadius;
      updateCorners();
      renderPagesList();
      renderBinder();
      updatePhysicalInfo();
      state.pages.forEach((page) => {
        for (const key in page.images) {
          const d = page.images[key];
          if (!d._naturalRatio) {
            const t = new Image();
            t.onload = () => {
              d._naturalRatio = t.width / t.height;
              renderBinder();
            };
            t.src = d.src;
          }
        }
      });
      setStatus('Project loaded (' + state.pages.length + ' pages)');
    } catch (err) {
      alert('Load failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function newProject() {
  if (!confirm('Start new project?')) return;
  state = {
    pages: [createEmptyPage()],
    currentPage: 0,
    selectedSlot: null,
    rangeSelection: null,
    viewScale: 3,
    clipboard: null,
    cornerMode: 'none',
    cornerRadius: 3
  };
  loadPageToUI();
  document.getElementById('corner-mode').value = 'none';
  document.getElementById('corner-radius').value = 3.18;
  updateCorners();
  renderPagesList();
  renderBinder();
  updatePhysicalInfo();
  updateClipboardIndicator();
}

// ============================================================
// PRINT LOGIC - BIN PACKING WITH SEAM GAPS AND CORNER ROUNDING
// ============================================================
function collectPrintPieces() {
  const pieces = [];
  state.pages.forEach((page, pageIdx) => {
    for (const key in page.images) {
      const [srow, scol] = key.split(',').map(Number);
      const img = page.images[key];
      const sw = img.slotW || 1;
      const sh = img.slotH || 1;

      const colGroups = [];
      let currentGroup = [scol];
      for (let c = scol; c < scol + sw - 1; c++) {
        if (page.seamsH[c] === 'cut') {
          colGroups.push(currentGroup);
          currentGroup = [c + 1];
        } else {
          currentGroup.push(c + 1);
        }
      }
      colGroups.push(currentGroup);

      const rowGroups = [];
      let currentRowGroup = [srow];
      for (let r = srow; r < srow + sh - 1; r++) {
        if (page.seamsV[r] === 'cut') {
          rowGroups.push(currentRowGroup);
          currentRowGroup = [r + 1];
        } else {
          currentRowGroup.push(r + 1);
        }
      }
      rowGroups.push(currentRowGroup);

      rowGroups.forEach(rowGroup => {
        colGroups.forEach(colGroup => {
          const firstCol = colGroup[0];
          const lastCol = colGroup[colGroup.length - 1];
          const firstRow = rowGroup[0];
          const lastRow = rowGroup[rowGroup.length - 1];
          const pieceW_pockets = lastCol - firstCol + 1;
          const pieceH_pockets = lastRow - firstRow + 1;
          const pieceW_mm = pieceW_pockets * page.pocketW + (pieceW_pockets - 1) * page.seamH;
          const pieceH_mm = pieceH_pockets * page.pocketH + (pieceH_pockets - 1) * page.seamV;

          let offsetX_mm = 0;
          let offsetY_mm = 0;
          for (let c = scol; c < firstCol; c++) {
            offsetX_mm += page.pocketW + page.seamH;
          }
          for (let r = srow; r < firstRow; r++) {
            offsetY_mm += page.pocketH + page.seamV;
          }

          pieces.push({
            pageIdx: pageIdx,
            slotKey: key,
            image: img,
            widthMm: pieceW_mm,
            heightMm: pieceH_mm,
            offsetX_mm: offsetX_mm,
            offsetY_mm: offsetY_mm,
            seamH: page.seamH,
            seamV: page.seamV,
            pocketW: page.pocketW,
            pocketH: page.pocketH,
            pieceCols: pieceW_pockets,
            pieceRows: pieceH_pockets,
            label: 'P' + (pageIdx + 1) + ' R' + (firstRow + 1) + 'C' + (firstCol + 1)
          });
        });
      });
    }
  });
  return pieces;
}

function packPieces(pieces, paperW, paperH, gapMm) {
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
      sheet.placements.push({
        piece: piece,
        orient: orient,
        x: nextX,
        y: shelf.y,
        w: w,
        h: h
      });
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
    sheet.placements.push({
      piece: piece,
      orient: orient,
      x: 0,
      y: nextY,
      w: w,
      h: h
    });
    return true;
  }
  return false;
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
  const margin = parseFloat(document.getElementById('paper-margin').value) || 0;
  let w, h;
  if (size === 'A4') { w = 210; h = 297; }
  else { w = 297; h = 420; }
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
  state.pages.forEach(page => {
    maxSeam = Math.max(maxSeam, page.seamH, page.seamV);
  });
  const gapMm = maxSeam;

  const result = packPieces(pieces, paper.usableW, paper.usableH, gapMm);

  if (result.tooLarge) {
    const p = result.tooLarge;
    resultEl.className = 'fit-result fit-bad';
    resultEl.innerHTML = '<b>Image too large for ' + paper.size + ' ' + paper.orient + '</b><br>' +
      p.label + ' is ' + p.widthMm.toFixed(1) + '×' + p.heightMm.toFixed(1) + ' mm which exceeds usable area (' +
      paper.usableW + '×' + paper.usableH + ' mm).<br><br>Try A3, landscape, or smaller margins.';
    confirmBtn.disabled = true;
    return;
  }

  const sheetCount = result.sheets.length;
  const pieceCount = pieces.length;
  const rotatedCount = result.sheets.reduce((sum, sheet) =>
    sum + sheet.placements.filter(p => p.orient.rotated).length, 0);

  resultEl.className = 'fit-result fit-ok';
  let msg = '<b>Ready to print:</b><br>';
  msg += pieceCount + ' image piece' + (pieceCount !== 1 ? 's' : '') + ' fit on ' + sheetCount + ' ' + paper.size + ' ' + paper.orient + ' sheet' + (sheetCount !== 1 ? 's' : '');
  if (rotatedCount > 0) {
    msg += '<br><span style="color:#FFB000">' + rotatedCount + ' piece' + (rotatedCount !== 1 ? 's' : '') + ' auto-rotated to fit</span>';
  }
  msg += '<br><span style="font-size:11px;color:#888">Gap between pieces: ' + gapMm + ' mm (matches largest seam for cutting)</span>';
  if (state.cornerMode !== 'none') {
    const modeText = state.cornerMode === 'outer' ? 'outer edges' : 'every card';
    msg += '<br><span style="font-size:11px;color:#888">Corners rounded: ' + state.cornerRadius + ' mm on ' + modeText + '</span>';
  }
  resultEl.innerHTML = msg;
  confirmBtn.disabled = false;

  window._printResult = result;
  window._printPaper = paper;
  window._printGap = gapMm;
}

function confirmPrint() {
  const paper = window._printPaper;
  const result = window._printResult;
  const gapMm = window._printGap;
  if (!paper || !result) {
    updatePrintFit();
    return;
  }
  const styleEl = document.createElement('style');
  styleEl.id = 'dynamic-print-style';
  styleEl.textContent = '@page { size: ' + paper.size + ' ' + paper.orient + '; margin: ' + paper.margin + 'mm; }';
  const oldStyle = document.getElementById('dynamic-print-style');
  if (oldStyle) oldStyle.remove();
  document.head.appendChild(styleEl);
  closePrintDialog();
  preparePrint(result, paper, gapMm);
}

function preparePrint(packResult, paper, gapMm) {
  const canvasArea = document.getElementById('canvas-area');
  const MM_TO_PX = 96 / 25.4;
  canvasArea.innerHTML = '';

  packResult.sheets.forEach((sheet, sheetIdx) => {
    const sheetDiv = document.createElement('div');
    sheetDiv.className = 'print-page';
    sheetDiv.style.width = (paper.usableW * MM_TO_PX) + 'px';
    sheetDiv.style.height = (paper.usableH * MM_TO_PX) + 'px';
    sheetDiv.style.background = 'white';
    sheetDiv.style.position = 'relative';
    sheetDiv.style.margin = '0 auto';

    sheet.placements.forEach(placement => {
      renderPrintPiece(sheetDiv, placement, MM_TO_PX);
    });

    canvasArea.appendChild(sheetDiv);
  });

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      canvasArea.innerHTML = '<div id="binder-canvas"></div>';
      loadPageToUI();
      renderPagesList();
      renderBinder();
    }, 500);
  }, 100);
}

function renderPrintPiece(sheetDiv, placement, MM_TO_PX) {
  const piece = placement.piece;
  const orient = placement.orient;
  const img = piece.image;

  const pieceDiv = document.createElement('div');
  pieceDiv.style.position = 'absolute';
  pieceDiv.style.left = (placement.x * MM_TO_PX) + 'px';
  pieceDiv.style.top = (placement.y * MM_TO_PX) + 'px';
  pieceDiv.style.width = (orient.w * MM_TO_PX) + 'px';
  pieceDiv.style.height = (orient.h * MM_TO_PX) + 'px';
  pieceDiv.style.overflow = 'hidden';

  // Apply corner rounding based on current mode
  if (state.cornerMode !== 'none' && state.cornerRadius > 0) {
    if (state.cornerMode === 'outer') {
      // Round the piece's outer corners
      pieceDiv.style.borderRadius = (state.cornerRadius * MM_TO_PX) + 'px';
    }
    // 'every' mode is handled below with per-pocket masks
  }

  const imgEl = document.createElement('img');
  imgEl.src = img.src;
  imgEl.style.position = 'absolute';
  imgEl.style.width = (img.widthMm * MM_TO_PX) + 'px';
  imgEl.style.height = 'auto';

  if (!orient.rotated) {
    imgEl.style.left = ((img.xMm - piece.offsetX_mm) * MM_TO_PX) + 'px';
    imgEl.style.top = ((img.yMm - piece.offsetY_mm) * MM_TO_PX) + 'px';
    imgEl.style.transform = 'rotate(' + img.rotate + 'deg)';
    imgEl.style.transformOrigin = 'top left';
  } else {
    imgEl.style.left = '0px';
    imgEl.style.top = '0px';
    imgEl.style.transform = 'rotate(90deg) translateY(-100%) translate(' +
      ((img.xMm - piece.offsetX_mm) * MM_TO_PX) + 'px, ' +
      ((img.yMm - piece.offsetY_mm) * MM_TO_PX) + 'px)';
    imgEl.style.transformOrigin = 'top left';
  }
  pieceDiv.appendChild(imgEl);

  // For 'every' mode: add corner overlays for each pocket within the piece
  if (state.cornerMode === 'every' && state.cornerRadius > 0) {
    renderEveryCornersForPrintPiece(pieceDiv, piece, orient, MM_TO_PX);
  }

  sheetDiv.appendChild(pieceDiv);
}

// For 'every' mode: place white corner overlays at each pocket within the piece
function renderEveryCornersForPrintPiece(pieceDiv, piece, orient, MM_TO_PX) {
  const radiusPx = state.cornerRadius * MM_TO_PX;
  const pocketW_mm = piece.pocketW;
  const pocketH_mm = piece.pocketH;
  const seamH_mm = piece.seamH;
  const seamV_mm = piece.seamV;
  const cols = piece.pieceCols;
  const rows = piece.pieceRows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let x_mm, y_mm, w_mm, h_mm;
      
      if (!orient.rotated) {
        x_mm = c * (pocketW_mm + seamH_mm);
        y_mm = r * (pocketH_mm + seamV_mm);
        w_mm = pocketW_mm;
        h_mm = pocketH_mm;
      } else {
        // When rotated, pockets flip - width becomes height
        x_mm = r * (pocketH_mm + seamV_mm);
        y_mm = c * (pocketW_mm + seamH_mm);
        w_mm = pocketH_mm;
        h_mm = pocketW_mm;
      }

      const x_px = x_mm * MM_TO_PX;
      const y_px = y_mm * MM_TO_PX;
      const w_px = w_mm * MM_TO_PX;
      const h_px = h_mm * MM_TO_PX;

      const corners = [
        { cls: 'tl', dx: 0, dy: 0 },
        { cls: 'tr', dx: w_px - radiusPx, dy: 0 },
        { cls: 'bl', dx: 0, dy: h_px - radiusPx },
        { cls: 'br', dx: w_px - radiusPx, dy: h_px - radiusPx }
      ];
      corners.forEach(corner => {
        const overlay = document.createElement('div');
        overlay.className = 'corner-overlay ' + corner.cls;
        overlay.style.left = (x_px + corner.dx) + 'px';
        overlay.style.top = (y_px + corner.dy) + 'px';
        overlay.style.width = radiusPx + 'px';
        overlay.style.height = radiusPx + 'px';
        pieceDiv.appendChild(overlay);
      });
    }
  }
}

// ============================================================
// SIZE GUIDE DIALOG
// ============================================================
function openSizeGuideDialog() {
  renderSizeGuide();
  document.getElementById('size-guide-modal').classList.add('open');
}

function closeSizeGuideDialog() {
  document.getElementById('size-guide-modal').classList.remove('open');
}

function renderSizeGuide() {
  const p = currentPage();
  const pocketW = p.pocketW;
  const pocketH = p.pocketH;
  const seamH = p.seamH;
  const seamV = p.seamV;

  document.getElementById('sg-pocket-info').textContent = pocketW + ' × ' + pocketH + ' mm';
  const seamText = (seamH === seamV) ? seamH + ' mm' : 'H:' + seamH + ' mm, V:' + seamV + ' mm';
  document.getElementById('sg-seam-info').textContent = seamText;

  const contentEl = document.getElementById('size-guide-content');
  contentEl.innerHTML = '';

  const sections = [
    { title: 'Horizontal Slots (1 row)', rows: 1, cols: [1, 2, 3, 4] },
    { title: 'Medium Grid Slots (2 rows)', rows: 2, cols: [1, 2, 3, 4] },
    { title: 'Tall Grid Slots (3 rows)', rows: 3, cols: [1, 2, 3, 4] }
  ];

  sections.forEach(section => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'size-guide-section';

    const titleEl = document.createElement('div');
    titleEl.className = 'size-guide-section-title';
    titleEl.textContent = section.title;
    sectionEl.appendChild(titleEl);

    const gridEl = document.createElement('div');
    gridEl.className = 'size-guide-grid';

    section.cols.forEach(cols => {
      const rows = section.rows;
      const widthMm = cols * pocketW + (cols - 1) * seamH;
      const heightMm = rows * pocketH + (rows - 1) * seamV;
      const widthInches = (widthMm / 25.4).toFixed(2);
      const heightInches = (heightMm / 25.4).toFixed(2);

      const maxDim = 60;
      const ratio = widthMm / heightMm;
      let previewW, previewH;
      if (ratio > 1) {
        previewW = Math.min(maxDim * 1.5, 100);
        previewH = previewW / ratio;
      } else {
        previewH = maxDim;
        previewW = previewH * ratio;
      }

      const itemEl = document.createElement('div');
      itemEl.className = 'size-guide-item';
      itemEl.innerHTML =
        '<div class="preview">' +
        '  <div class="preview-box" style="width:' + previewW + 'px;height:' + previewH + 'px"></div>' +
        '</div>' +
        '<div class="label">' + cols + '×' + rows + '</div>' +
        '<div class="mm">' + widthMm.toFixed(1) + ' × ' + heightMm.toFixed(1) + ' mm</div>' +
        '<div class="inches">' + widthInches + '" × ' + heightInches + '"</div>';

      gridEl.appendChild(itemEl);
    });

    sectionEl.appendChild(gridEl);
    contentEl.appendChild(sectionEl);
  });
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
  if (!state.selectedSlot) return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  const img = currentPage().images[key];
  if (!img) return;
  if (!e.target.closest('.pocket.has-image, .pocket.selected, .seam-bridge')) return;
  const selPocket = e.target.closest('.pocket');
  if (selPocket) {
    const r = parseInt(selPocket.dataset.row);
    const c = parseInt(selPocket.dataset.col);
    const slot = findSlotAt(r, c);
    if (!slot || slot.row !== state.selectedSlot.row || slot.col !== state.selectedSlot.col) return;
  }
  e.preventDefault();
  const delta = e.deltaY > 0 ? -3 : 3;
  zoomImage(delta);
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (!state.selectedSlot) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const key = state.selectedSlot.row + ',' + state.selectedSlot.col;
  const img = currentPage().images[key];
  if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
    copyImageSettings();
    e.preventDefault();
    return;
  }
  if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
    pasteImageSettings();
    e.preventDefault();
    return;
  }
  if (!img) return;
  const step = e.shiftKey ? 10 : 1;
  let handled = true;
  if (e.key === 'ArrowLeft') img.xMm -= step;
  else if (e.key === 'ArrowRight') img.xMm += step;
  else if (e.key === 'ArrowUp') img.yMm -= step;
  else if (e.key === 'ArrowDown') img.yMm += step;
  else if (e.key === '+' || e.key === '=') { zoomImage(3); return; }
  else if (e.key === '-') { zoomImage(-3); return; }
  else if (e.key === 'Delete') { removeImage(); return; }
  else handled = false;
  if (handled) {
    e.preventDefault();
    clampImage(img);
    renderBinder();
    updateProperties();
  }
});

document.addEventListener('mousedown', (e) => {
  const pocket = e.target.closest('.pocket');
  if (!pocket) return;
  const r = parseInt(pocket.dataset.row);
  const c = parseInt(pocket.dataset.col);
  const slot = findSlotAt(r, c);
  if (!slot) return;
  if (!state.selectedSlot || state.selectedSlot.row !== slot.row || state.selectedSlot.col !== slot.col) return;
  const img = currentPage().images[slot.key];
  if (!img) return;
  dragging = { startX: e.clientX, startY: e.clientY, imgX: img.xMm, imgY: img.yMm, key: slot.key };
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const img = currentPage().images[dragging.key];
  if (!img) return;
  const dx = (e.clientX - dragging.startX) / state.viewScale;
  const dy = (e.clientY - dragging.startY) / state.viewScale;
  img.xMm = dragging.imgX + dx;
  img.yMm = dragging.imgY + dy;
  clampImage(img);
  renderBinder();
});

document.addEventListener('mouseup', (e) => {
  if (dragging) {
    updateProperties();
    setTimeout(() => { dragging = null; }, 50);
    return;
  }
  if (rangeSelecting) {
    const startR = Math.min(rangeSelecting.startRow, rangeSelecting.currentRow);
    const startC = Math.min(rangeSelecting.startCol, rangeSelecting.currentCol);
    const endR = Math.max(rangeSelecting.startRow, rangeSelecting.currentRow);
    const endC = Math.max(rangeSelecting.startCol, rangeSelecting.currentCol);
    if (startR !== endR || startC !== endC) {
      setRangeSelection(startR, startC, endR, endC);
    } else {
      state.rangeSelection = null;
    }
    rangeSelecting = null;
    document.querySelectorAll('.pocket.range-selected').forEach(el => el.classList.remove('range-selected'));
    if (state.rangeSelection) {
      const rs = state.rangeSelection;
      document.querySelectorAll('.pocket').forEach(el => {
        const r = parseInt(el.dataset.row);
        const c = parseInt(el.dataset.col);
        if (r >= rs.startRow && r <= rs.endRow && c >= rs.startCol && c <= rs.endCol) {
          el.classList.add('range-selected');
        }
      });
    }
  }
});

document.body.addEventListener('dragover', (e) => e.preventDefault());
document.body.addEventListener('drop', (e) => e.preventDefault());

document.getElementById('print-modal').addEventListener('click', (e) => {
  if (e.target.id === 'print-modal') closePrintDialog();
});
document.getElementById('about-modal').addEventListener('click', (e) => {
  if (e.target.id === 'about-modal') closeAboutDialog();
});
document.getElementById('size-guide-modal').addEventListener('click', (e) => {
  if (e.target.id === 'size-guide-modal') closeSizeGuideDialog();
});

// ============================================================
// STARTUP
// ============================================================
loadPageToUI();
renderPagesList();
updateBinder();
updateCorners();