/* db.js — stockage dans l'appareil (IndexedDB) : sommets, liens, fichiers joints, réglages. */
(function (racine) {
  'use strict';
  const NOM = 'cerveau-v1';
  let db = null;
  let disponible = false;

  function ouvrir() {
    return new Promise((ok) => {
      if (!racine.indexedDB) return ok(false);
      let r;
      try { r = indexedDB.open(NOM, 1); } catch (e) { return ok(false); }
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('noeuds', { keyPath: 'id' });
        d.createObjectStore('liens', { keyPath: 'id' });
        d.createObjectStore('fichiers', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'cle' });
      };
      r.onsuccess = () => { db = r.result; disponible = true; ok(true); };
      r.onerror = () => ok(false);
      r.onblocked = () => ok(false);
    });
  }

  function tx(magasins, mode, fn) {
    return new Promise((ok, ko) => {
      if (!db) return ok(undefined);
      let res;
      const t = db.transaction(magasins, mode);
      t.oncomplete = () => ok(res && 'result' in res ? res.result : res);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
      res = fn(t);
    });
  }

  const tout = (m) => tx([m], 'readonly', (t) => t.objectStore(m).getAll()).then((r) => r || []);
  const lire = (m, id) => tx([m], 'readonly', (t) => t.objectStore(m).get(id));
  const mettre = (m, objets) => objets.length ? tx([m], 'readwrite', (t) => { const s = t.objectStore(m); objets.forEach((o) => s.put(o)); }) : Promise.resolve();
  const supprimer = (m, ids) => ids.length ? tx([m], 'readwrite', (t) => { const s = t.objectStore(m); ids.forEach((i) => s.delete(i)); }) : Promise.resolve();
  const vider = () => tx(['noeuds', 'liens', 'fichiers', 'meta'], 'readwrite', (t) => { ['noeuds', 'liens', 'fichiers', 'meta'].forEach((m) => t.objectStore(m).clear()); });
  const tousLesIdFichiers = () => tx(['fichiers'], 'readonly', (t) => t.objectStore('fichiers').getAllKeys()).then((r) => r || []);

  racine.CerveauDB = { ouvrir, tout, lire, mettre, supprimer, vider, tousLesIdFichiers, get disponible() { return disponible; } };
})(typeof self !== 'undefined' ? self : this);
