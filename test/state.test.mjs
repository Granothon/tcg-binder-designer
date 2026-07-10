import test from 'node:test';
import assert from 'node:assert/strict';
import {
  state, createEmptyPage, currentPage,
  pushHistory, undo, redo, resetHistory, historyDepth, HISTORY_LIMIT,
  normalizeProjectData, projectHasContent, serializeProject
} from '../js/state.js';

function freshState() {
  state.pages = [createEmptyPage()];
  state.currentPage = 0;
  state.selectedSlot = null;
  state.rangeSelection = null;
  resetHistory();
}

function addImage(key = '0,0') {
  currentPage().images[key] = {
    src: 'data:x', widthMm: 100, xMm: 0, yMm: 0, rotate: 0, slotW: 1, slotH: 1
  };
}

test('undo restores the state captured before a mutation', () => {
  freshState();
  pushHistory();
  addImage();
  assert.equal(Object.keys(currentPage().images).length, 1);
  assert.equal(undo(), true);
  assert.equal(Object.keys(currentPage().images).length, 0);
  assert.equal(redo(), true);
  assert.equal(Object.keys(currentPage().images).length, 1);
});

test('snapshots are isolated from later mutations', () => {
  freshState();
  addImage();
  pushHistory();
  currentPage().images['0,0'].widthMm = 500;
  currentPage().emptyPockets.push('2,2');
  assert.equal(undo(), true);
  assert.equal(currentPage().images['0,0'].widthMm, 100);
  assert.deepEqual(currentPage().emptyPockets, []);
});

test('undo/redo with nothing to do returns false', () => {
  freshState();
  assert.equal(undo(), false);
  assert.equal(redo(), false);
});

test('a new mutation clears the redo stack', () => {
  freshState();
  pushHistory();
  addImage('0,0');
  undo();
  assert.equal(historyDepth().redo, 1);
  pushHistory();
  addImage('1,1');
  assert.equal(historyDepth().redo, 0);
});

test('same-tag pushes coalesce into one undo step', () => {
  freshState();
  pushHistory('zoom');
  pushHistory('zoom');
  pushHistory('zoom');
  assert.equal(historyDepth().undo, 1);
  pushHistory('nudge');
  assert.equal(historyDepth().undo, 2);
});

test('history is capped at HISTORY_LIMIT', () => {
  freshState();
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) pushHistory();
  assert.equal(historyDepth().undo, HISTORY_LIMIT);
});

test('undo restores page count and clamps current page', () => {
  freshState();
  pushHistory();
  state.pages.push(createEmptyPage());
  state.currentPage = 1;
  assert.equal(undo(), true);
  assert.equal(state.pages.length, 1);
  assert.equal(state.currentPage, 0);
});

test('normalizeProjectData migrates the legacy scale/x/y crop format', () => {
  const legacy = {
    viewScale: 3,
    pages: [Object.assign(createEmptyPage(), {
      images: { '0,0': { src: 'x', scale: 1.5, x: 30, y: 15 } }
    })]
  };
  const norm = normalizeProjectData(legacy);
  const img = norm.pages[0].images['0,0'];
  assert.equal(img.widthMm, 68 * 1.5);
  assert.equal(img.xMm, 10);
  assert.equal(img.yMm, 5);
  assert.equal(img.scale, undefined);
  assert.equal(img.slotW, 1);
  assert.equal(norm.cornerMode, 'none');
  assert.equal(norm.cornerRadius, 3.18);
  assert.equal(norm.imageMaxDim, 3000);
});

test('normalizeProjectData resizes seam arrays to the grid', () => {
  const page = Object.assign(createEmptyPage(), { rows: 4, cols: 2, seamsH: [], seamsV: ['cut'] });
  const norm = normalizeProjectData({ pages: [page] });
  assert.equal(norm.pages[0].seamsH.length, 1);
  assert.equal(norm.pages[0].seamsV.length, 3);
});

test('normalizeProjectData rejects invalid input', () => {
  assert.throws(() => normalizeProjectData(null));
  assert.throws(() => normalizeProjectData({}));
  assert.throws(() => normalizeProjectData({ pages: [] }));
});

test('projectHasContent detects images, empties and extra pages', () => {
  assert.equal(projectHasContent({ pages: [createEmptyPage()] }), false);
  assert.equal(projectHasContent({ pages: [createEmptyPage(), createEmptyPage()] }), true);
  const withImage = createEmptyPage();
  withImage.images['0,0'] = { src: 'x' };
  assert.equal(projectHasContent({ pages: [withImage] }), true);
  const withEmpty = createEmptyPage();
  withEmpty.emptyPockets.push('0,0');
  assert.equal(projectHasContent({ pages: [withEmpty] }), true);
});

test('serializeProject round-trips through normalizeProjectData', () => {
  freshState();
  addImage();
  state.pages[0].emptyPockets.push('1,1');
  const data = JSON.parse(JSON.stringify(serializeProject()));
  const norm = normalizeProjectData(data);
  assert.equal(norm.pages.length, 1);
  assert.equal(norm.pages[0].images['0,0'].widthMm, 100);
  assert.deepEqual(norm.pages[0].emptyPockets, ['1,1']);
});
