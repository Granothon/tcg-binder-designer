/*
  Michify - TCG Binder Designer
  storage.js - IndexedDB-backed autosave. localStorage is too small for
  projects with embedded images, IndexedDB comfortably holds many MB.
  All functions resolve/reject as promises; callers treat failures as
  non-fatal (private browsing modes may block IndexedDB entirely).
  Copyright (c) 2026 Risto Ruuskanen
  Licensed under the MIT License
*/

const DB_NAME = 'michify';
const STORE = 'autosave';
const KEY = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function saveAutosave(data) {
  return withStore('readwrite', store => store.put(data, KEY));
}

export function loadAutosave() {
  return withStore('readonly', store => store.get(KEY));
}

export function clearAutosave() {
  return withStore('readwrite', store => store.delete(KEY));
}
