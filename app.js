/* app.js — assemble tout : onglets, carte, notes, réglages, recherche, tags, sauvegarde. */
(function () {
  'use strict';
  const DB = self.CerveauDB, CC = self.CerveauCarte, CE = self.CerveauEditeur;
  const $ = (id) => document.getElementById(id);
  const esc = CE.esc, nouvelId = CE.nouvelId;

  /* ---------- icônes ---------- */
  const svg = (d, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>' + d + '</svg>';
  const IC = {
    loupe: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    centrer: svg('<path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4"/><circle cx="12" cy="12" r="2.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.6"'),
    retour: svg('<path d="M15 5l-7 7 7 7"/>', ' stroke-width="2.4"'),
    oeil: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    crayon: svg('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
    plus3: svg('<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>', ' stroke-width="2.4"'),
    carte: svg('<circle cx="6" cy="7" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M8 8l8-1.2M7.2 9.2l3.6 6.8M16.8 8.2L13.2 16"/>'),
    notes: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>'),
    reglages: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  };
  $('b-loupe').innerHTML = IC.loupe; $('b-centrer').innerHTML = IC.centrer; $('b-plus').innerHTML = IC.plus;
  $('ic-carte').innerHTML = IC.carte; $('ic-notes').innerHTML = IC.notes; $('ic-reglages').innerHTML = IC.reglages;

  /* ---------- données ---------- */
  const PALETTE_DEFAUT = [
    { c: '#5b9bff', nom: 'Définition' }, { c: '#ff5b5b', nom: 'Important' }, { c: '#43d68c', nom: 'Exemple' },
    { c: '#ffd23f', nom: 'À revoir' }, { c: '#b47cff', nom: 'Idée' }, { c: '#ff9a4d', nom: 'Question' },
  ];
  const COULEURS_NOEUD = ['#e8e8ee', '#6ea8ff', '#ff6b6b', '#5ee0a0', '#ffd166', '#c084fc', '#ff9f5a', '#4fd8e8'];
  const etat = { noeuds: [], liens: [], meta: { palette: PALETTE_DEFAUT.map((p) => ({ ...p })), animer: true } };
  const parId = new Map();
  let carte = null, editeur = null, vueCourante = 'carte', modeLien = false;
  const dateFr = (t, o) => new Date(t).toLocaleDateString('fr-FR', o || { day: 'numeric', month: 'short' });
  const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function pur(n) { return { id: n.id, titre: n.titre, html: n.html, texte: n.texte, tags: n.tags, x: n.x, y: n.y, z: n.z, forme: n.forme, couleur: n.couleur, fixe: !!n.fixe, jour: n.jour || null, cree: n.cree, modifie: n.modifie }; }
  function completer(n) {
    return { id: n.id || nouvelId(), titre: n.titre || '', html: n.html || '', texte: n.texte || '', tags: Array.isArray(n.tags) ? n.tags : [], x: +n.x || 0, y: +n.y || 0, z: +n.z || 0,
      forme: n.forme || 'sphere', couleur: n.couleur || COULEURS_NOEUD[0], fixe: !!n.fixe, jour: n.jour || null, cree: n.cree || Date.now(), modifie: n.modifie || Date.now() };
  }
  function indexer() { parId.clear(); etat.noeuds.forEach((n) => parId.set(n.id, n)); carte && carte.reindexer(); }

  /* ---------- enregistrement ---------- */
  const file = new Set(); let tFlush = null;
  function sauverNoeud(n) { file.add(n.id); clearTimeout(tFlush); tFlush = setTimeout(flush, 300); }
  async function flush() {
    clearTimeout(tFlush);
    const ids = [...file]; file.clear();
    const objs = ids.map((id) => parId.get(id)).filter(Boolean).map(pur);
    try { await DB.mettre('noeuds', objs); } catch (e) { toast("Impossible d'enregistrer (mémoire pleine ?)"); }
  }
  function sauverPositions() { etat.noeuds.forEach((n) => file.add(n.id)); clearTimeout(tFlush); tFlush = setTimeout(flush, 600); }
  function sauverMeta() { DB.mettre('meta', [{ cle: 'palette', valeur: etat.meta.palette }, { cle: 'animer', valeur: etat.meta.animer }]).catch(() => {}); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { editeur && editeur.sauverMaintenant(); flush(); } });
  addEventListener('pagehide', () => { editeur && editeur.sauverMaintenant(); flush(); });

  /* ---------- toast & fenêtres ---------- */
  let tToast = null;
  function toast(t) { const e = $('toast'); e.textContent = t; e.classList.remove('cache'); clearTimeout(tToast); tToast = setTimeout(() => e.classList.add('cache'), 2200); }

  function ouvrirModale(html, lier) {
    const m = $('modale');
    m.innerHTML = '<div class="boite">' + html + '</div>';
    m.classList.remove('cache');
    const fermer = () => { m.classList.add('cache'); m.innerHTML = ''; };
    lier(m.firstChild, fermer);
    m.onpointerdown = (e) => { if (e.target === m && m._annuler) m._annuler(); };
    return m;
  }
  function saisie(titre, placeholder, valeur, opt) {
    opt = opt || {};
    return new Promise((res) => {
      const m = ouvrirModale('<h3>' + esc(titre) + '</h3>' + (opt.texte ? '<p>' + esc(opt.texte) + '</p>' : '') +
        '<input type="' + (opt.type || 'text') + '" id="m-in" placeholder="' + esc(placeholder || '') + '" value="' + esc(valeur || '') + '" autocomplete="off" autocapitalize="' + (opt.type === 'url' ? 'off' : 'sentences') + '" spellcheck="false" enterkeyhint="done">' +
        (opt.case ? '<button class="interrupteur" id="m-case" role="switch" aria-checked="' + !!opt.case.on + '"><span>' + esc(opt.case.label) + '</span><i class="sw' + (opt.case.on ? ' on' : '') + '"></i></button>' : '') +
        '<div class="boutons"><button class="act" id="m-non">Annuler</button><button class="act plein" id="m-ok">' + esc(opt.ok || 'OK') + '</button></div>', (boite, fermer) => {
        const inp = boite.querySelector('#m-in'); let aCase = opt.case ? !!opt.case.on : false;
        const fin = (v) => { fermer(); res(v); };
        boite.querySelector('#m-ok').onclick = () => fin(opt.case ? { texte: inp.value, case: aCase } : inp.value);
        boite.querySelector('#m-non').onclick = () => fin(null);
        $('modale')._annuler = () => fin(null);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); boite.querySelector('#m-ok').click(); } });
        const c = boite.querySelector('#m-case');
        if (c) c.onclick = () => { aCase = !aCase; c.setAttribute('aria-checked', aCase); c.querySelector('.sw').classList.toggle('on', aCase); };
      });
      setTimeout(() => { const i = m.querySelector('#m-in'); if (i) { i.focus(); i.select(); } }, 60);
    });
  }
  function confirmer(titre, texte, ok, danger) {
    return new Promise((res) => {
      ouvrirModale('<h3>' + esc(titre) + '</h3><p>' + esc(texte) + '</p><div class="boutons"><button class="act" id="m-non">Annuler</button><button class="act ' + (danger ? 'danger' : 'plein') + '" id="m-ok">' + esc(ok || 'OK') + '</button></div>', (boite, fermer) => {
        const fin = (v) => { fermer(); res(v); };
        boite.querySelector('#m-ok').onclick = () => fin(true); boite.querySelector('#m-non').onclick = () => fin(false);
        $('modale')._annuler = () => fin(false);
      });
    });
  }
  function editerPalette() {
    return new Promise((res) => {
      const pal = etat.meta.palette.map((p) => ({ ...p }));
      ouvrirModale('<h3>Mon code couleur</h3><p>Choisis une couleur et dis ce qu\'elle veut dire pour toi.</p><div class="lignes" id="m-lignes"></div><button class="act" id="m-add">+ Ajouter une couleur</button><div class="boutons"><button class="act" id="m-non">Annuler</button><button class="act plein" id="m-ok">Enregistrer</button></div>', (boite, fermer) => {
        const zone = boite.querySelector('#m-lignes');
        const dessiner = () => {
          zone.innerHTML = '';
          pal.forEach((p, i) => {
            const l = document.createElement('div'); l.className = 'lc';
            l.innerHTML = '<input type="color" value="' + esc(p.c) + '"><input type="text" value="' + esc(p.nom) + '" placeholder="Sens de cette couleur" autocomplete="off" style="flex:1"><button class="rond" aria-label="Retirer" style="width:36px;height:36px;color:#8d8d95">✕</button>';
            l.children[0].oninput = (e) => { p.c = e.target.value; };
            l.children[1].oninput = (e) => { p.nom = e.target.value; };
            l.children[2].onclick = () => { if (pal.length > 1) { pal.splice(i, 1); dessiner(); } };
            zone.appendChild(l);
          });
          boite.querySelector('#m-add').style.display = pal.length >= 10 ? 'none' : '';
        };
        dessiner();
        boite.querySelector('#m-add').onclick = () => { pal.push({ c: '#8ab4ff', nom: '' }); dessiner(); };
        const fin = (ok) => { fermer(); if (ok) { etat.meta.palette = pal; sauverMeta(); dessinerReglages(); } res(ok); };
        boite.querySelector('#m-ok').onclick = () => fin(true); boite.querySelector('#m-non').onclick = () => fin(false);
        $('modale')._annuler = () => fin(false);
      });
    });
  }

  /* ---------- apparence d'un sommet (forme + couleur) ---------- */
  function construireAspect(cont, n) {
    cont.innerHTML = '';
    const f = document.createElement('div'); f.className = 'formes';
    CC.LISTE_FORMES.forEach(([id, nom, glyphe]) => {
      const b = document.createElement('button'); b.className = 'forme' + (n.forme === id ? ' on' : ''); b.innerHTML = '<b>' + glyphe + '</b>' + nom;
      b.onclick = () => { n.forme = id; n.modifie = Date.now(); sauverNoeud(n); carte.redessiner(); construireAspect(cont, n); };
      f.appendChild(b);
    });
    const c = document.createElement('div'); c.className = 'couleurs';
    COULEURS_NOEUD.concat(etat.meta.palette.map((p) => p.c)).filter((x, i, a) => a.indexOf(x) === i).forEach((col) => {
      const b = document.createElement('button'); b.className = 'pastille' + (n.couleur === col ? ' on' : ''); b.style.background = col; b.setAttribute('aria-label', col);
      b.onclick = () => { n.couleur = col; n._rgb = null; n.modifie = Date.now(); sauverNoeud(n); carte.redessiner(); construireAspect(cont, n); };
      c.appendChild(b);
    });
    cont.appendChild(f); cont.appendChild(c);
  }

  /* ---------- création / suppression ---------- */
  function creerNoeud(titre, parent, extra) {
    const n = completer({ titre, ...(extra || {}) });
    carte.placerNouveau(n, parent);
    etat.noeuds.push(n); parId.set(n.id, n);
    if (parent) { const l = { id: nouvelId(), a: parent.id, b: n.id }; etat.liens.push(l); DB.mettre('liens', [l]).catch(() => {}); }
    carte.reindexer(); carte.reveiller(1);
    sauverNoeud(n);
    dessinerNotes(); majVide();
    return n;
  }
  async function supprimerNoeud(n) {
    const ok = await confirmer('Supprimer « ' + (n.titre || 'Sans titre') + ' » ?', 'La note, ses liens et ses pièces jointes seront effacés. Impossible de revenir en arrière.', 'Supprimer', true);
    if (!ok) return false;
    if (editeur.ouvert && editeur.noeud === n) editeur.fermer();
    const liens = etat.liens.filter((l) => l.a === n.id || l.b === n.id);
    etat.liens = etat.liens.filter((l) => !liens.includes(l));
    etat.noeuds = etat.noeuds.filter((x) => x !== n);
    const tmp = document.createElement('div'); tmp.innerHTML = n.html || '';
    const idsF = [...tmp.querySelectorAll('[data-f]')].map((e) => e.getAttribute('data-f'));
    await DB.supprimer('noeuds', [n.id]).catch(() => {}); await DB.supprimer('liens', liens.map((l) => l.id)).catch(() => {});
    file.delete(n.id);
    if (idsF.length) await nettoyerFichiers();
    if (carte.selection === n.id) { carte.choisir(null); }
    indexer(); carte.reveiller(0.6); dessinerNotes(); majVide(); majSelection(null);
    return true;
  }
  async function nettoyerFichiers() {            // supprime les fichiers qui ne sont plus utilisés par aucune note
    try {
      const utilises = new Set();
      etat.noeuds.forEach((n) => { const re = /data-f="([^"]+)"/g; let m; while ((m = re.exec(n.html || ''))) utilises.add(m[1]); });
      const tous = await DB.tousLesIdFichiers();
      await DB.supprimer('fichiers', tous.filter((i) => !utilises.has(i)));
    } catch (e) { /* pas grave */ }
  }

  /* ---------- carte : sommet choisi ---------- */
  function majSelection(n) {
    const box = $('carte-sel');
    if (!n) { box.classList.add('cache'); return; }
    if (modeLien) return;
    box.classList.remove('cache');
    $('cs-nom').textContent = n.titre || 'Sans titre';
    const deg = etat.liens.filter((l) => l.a === n.id || l.b === n.id).length;
    $('cs-info').textContent = deg + (deg > 1 ? ' liens' : ' lien') + (n.tags.length ? ' · ' + n.tags.map((t) => '#' + t).join(' ') : '');
    box.querySelector('[data-a=epingle]').textContent = n.fixe ? 'Libérer' : 'Fixer';
    $('cs-aspect').classList.add('cache');
  }
  $('carte-sel').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const n = parId.get(carte.selection); if (!n) return;
    const a = b.dataset.a;
    if (a === 'ouvrir') ouvrirNoeud(n);
    else if (a === 'enfant') {
      const t = await saisie('Nouveau sommet relié à « ' + (n.titre || 'Sans titre') + ' »', 'Titre', '', { ok: 'Créer' });
      if (t == null) return;
      const c = creerNoeud(t.trim() || 'Sans titre', n);
      carte.choisir(c.id, true);
    } else if (a === 'relier') {
      modeLien = true; carte.definirMode('relier');
      $('carte-sel').classList.add('cache');
      const bd = $('bandeau'); bd.classList.remove('cache');
      bd.innerHTML = '<span>Touche les sommets à relier à « ' + esc(n.titre || 'Sans titre') + ' »</span><button id="b-fini">Terminé</button>';
      $('b-fini').onclick = finirRelier;
    } else if (a === 'aspect') {
      const z = $('cs-aspect'); z.classList.toggle('cache');
      if (!z.classList.contains('cache')) construireAspect(z, n);
    } else if (a === 'epingle') { n.fixe = !n.fixe; sauverNoeud(n); majSelection(n); carte.reveiller(0.5); toast(n.fixe ? 'Sommet fixé : il ne bouge plus' : 'Sommet libéré'); }
    else if (a === 'suppr') supprimerNoeud(n);
  });
  function finirRelier() {
    modeLien = false; carte.definirMode(null); $('bandeau').classList.add('cache');
    majSelection(parId.get(carte.selection) || null);
  }
  function basculerLien(n) {
    const s = parId.get(carte.selection); if (!s || s === n) return;
    const ex = etat.liens.find((l) => (l.a === s.id && l.b === n.id) || (l.a === n.id && l.b === s.id));
    if (ex) { etat.liens = etat.liens.filter((l) => l !== ex); DB.supprimer('liens', [ex.id]).catch(() => {}); toast('Lien retiré avec « ' + (n.titre || 'Sans titre').slice(0, 24) + ' »'); }
    else { const l = { id: nouvelId(), a: s.id, b: n.id }; etat.liens.push(l); DB.mettre('liens', [l]).catch(() => {}); toast('Relié à « ' + (n.titre || 'Sans titre').slice(0, 24) + ' »'); }
    carte.reindexer(); carte.reveiller(0.8);
  }

  /* ---------- recherche (loupe) ---------- */
  let tagsActifs = new Set();
  const tousLesTags = () => [...new Set(etat.noeuds.flatMap((n) => n.tags))].sort();
  function correspond(n, jetons, tags) {
    for (const t of tags) if (!n.tags.includes(t)) return false;
    if (!jetons.length) return true;
    const foin = normaliser(n.titre + ' ' + n.tags.join(' ') + ' ' + n.texte);
    return jetons.every((j) => (j[0] === '#' ? n.tags.some((t) => normaliser(t).startsWith(j.slice(1))) : foin.includes(j)));
  }
  const jetonsDe = (q) => normaliser(q).split(/\s+/).filter(Boolean);
  function surligner(texte, jetons) {
    let h = esc(texte);
    jetons.filter((j) => j[0] !== '#' && j.length > 1).forEach((j) => { try { h = h.replace(new RegExp('(' + j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); } catch (e) { /* rien */ } });
    return h;
  }
  function extrait(n, jetons) {
    const t = n.texte || '';
    if (!t) return '';
    const nt = normaliser(t);
    const j = jetons.find((x) => x[0] !== '#' && nt.includes(x));
    const i = j ? Math.max(0, nt.indexOf(j) - 25) : 0;
    return (i ? '…' : '') + t.slice(i, i + 90).replace(/\s+/g, ' ');
  }
  function majRecherche() {
    const q = $('q').value, jetons = jetonsDe(q);
    const actif = jetons.length > 0 || tagsActifs.size > 0;
    const box = $('q-tags'); box.innerHTML = '';
    tousLesTags().forEach((t) => { const b = document.createElement('button'); b.className = 'puce' + (tagsActifs.has(t) ? ' on' : ''); b.textContent = '#' + t; b.onclick = () => { tagsActifs.has(t) ? tagsActifs.delete(t) : tagsActifs.add(t); majRecherche(); }; box.appendChild(b); });
    const res = $('q-res'); res.innerHTML = '';
    if (!actif) { carte.definirFiltre(null); return; }
    const trouves = etat.noeuds.filter((n) => correspond(n, jetons, tagsActifs));
    carte.definirFiltre(new Set(trouves.map((n) => n.id)));
    trouves.slice(0, 14).forEach((n) => {
      const b = document.createElement('button'); b.className = 'res';
      b.innerHTML = '<b>' + surligner(n.titre || 'Sans titre', jetons) + '</b><small>' + surligner(extrait(n, jetons), jetons) + '</small>';
      b.onclick = () => { fermerRecherche(); carte.choisir(n.id, true); };
      res.appendChild(b);
    });
    if (!trouves.length) { const p = document.createElement('div'); p.className = 'aide'; p.style.padding = '8px 4px 2px'; p.textContent = 'Aucun sommet ne correspond.'; res.appendChild(p); }
  }
  function ouvrirRecherche() { $('recherche').classList.remove('cache'); majRecherche(); setTimeout(() => $('q').focus(), 50); }
  function fermerRecherche() { $('recherche').classList.add('cache'); $('q').value = ''; $('q').blur(); tagsActifs = new Set(); carte.definirFiltre(null); }
  $('b-loupe').onclick = () => ($('recherche').classList.contains('cache') ? ouvrirRecherche() : fermerRecherche());
  $('q').addEventListener('input', majRecherche);
  $('b-centrer').onclick = () => carte.recentrer();
  $('b-plus').onclick = async () => {
    const sel = parId.get(carte.selection);
    const r = await saisie('Nouveau sommet', 'Titre (ex. Philosophie)', '', { ok: 'Créer', case: sel ? { label: 'Relier à « ' + (sel.titre || 'Sans titre').slice(0, 30) + ' »', on: true } : null });
    if (r == null) return;
    const texte = (sel ? r.texte : r).trim() || 'Sans titre';
    const n = creerNoeud(texte, sel && r.case ? sel : null);
    carte.choisir(n.id, true);
  };
  function majVide() { $('vide').classList.toggle('cache', !(vueCourante === 'carte' && etat.noeuds.length === 0)); }

  /* ---------- notes ---------- */
  let tagsNotes = new Set();
  function dessinerNotes() {
    const q = $('nq').value, jetons = jetonsDe(q);
    const bt = $('n-tags'); bt.innerHTML = '';
    tousLesTags().forEach((t) => { const b = document.createElement('button'); b.className = 'puce' + (tagsNotes.has(t) ? ' on' : ''); b.textContent = '#' + t; b.onclick = () => { tagsNotes.has(t) ? tagsNotes.delete(t) : tagsNotes.add(t); dessinerNotes(); }; bt.appendChild(b); });
    const liste = $('n-liste'); liste.innerHTML = '';
    const ns = etat.noeuds.filter((n) => correspond(n, jetons, tagsNotes)).sort((a, b) => b.modifie - a.modifie);
    if (!ns.length) { liste.innerHTML = '<p class="aide" style="text-align:center;margin-top:24px">' + (etat.noeuds.length ? 'Aucune note ne correspond.' : 'Aucune note pour l\'instant.') + '</p>'; return; }
    ns.forEach((n) => {
      const b = document.createElement('button'); b.className = 'note';
      b.innerHTML = '<b>' + surligner(n.titre || 'Sans titre', jetons) + '</b>' + (n.texte ? '<p>' + surligner(extrait(n, jetons), jetons) + '</p>' : '') +
        '<div class="meta">' + n.tags.map((t) => '<span class="tag">#' + esc(t) + '</span>').join('') + '<span class="quand">' + dateFr(n.modifie) + '</span></div>';
      b.onclick = () => ouvrirNoeud(n);
      liste.appendChild(b);
    });
  }
  $('nq').addEventListener('input', dessinerNotes);
  $('n-nouveau').onclick = async () => {
    const t = await saisie('Nouveau sommet', 'Titre', '', { ok: 'Créer' });
    if (t == null) return;
    const n = creerNoeud(t.trim() || 'Sans titre', null);
    ouvrirNoeud(n);
  };
  $('n-jour').onclick = () => {
    const d = new Date(), cle = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let n = etat.noeuds.find((x) => x.jour === cle);
    if (!n) { n = creerNoeud('Journée · ' + dateFr(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), null, { jour: cle, tags: ['journée'] }); }
    ouvrirNoeud(n);
  };

  /* ---------- éditeur ---------- */
  function menuNoeud(n, menu, fermer) {
    const bouton = (txt, f, cl) => { const b = document.createElement('button'); b.textContent = txt; if (cl) b.className = cl; b.onclick = f; menu.appendChild(b); return b; };
    bouton('Voir sur la carte', () => { fermer(); voirSurCarte(n); });
    const zone = document.createElement('div'); zone.className = 'aspect cache';
    bouton('Forme et couleur', () => { zone.classList.toggle('cache'); if (!zone.classList.contains('cache')) construireAspect(zone, n); });
    menu.appendChild(zone);
    bouton(n.fixe ? 'Libérer la position' : 'Fixer la position', () => { n.fixe = !n.fixe; sauverNoeud(n); fermer(); toast(n.fixe ? 'Sommet fixé' : 'Sommet libéré'); carte.reveiller(0.5); });
    bouton('Supprimer ce sommet', () => { fermer(); supprimerNoeud(n); }, 'danger');
  }
  editeur = CE.creer({
    DB, etat, icones: { retour: IC.retour, oeil: IC.oeil, crayon: IC.crayon, plus3: IC.plus3 },
    modale: { saisie }, toast, palette: () => etat.meta.palette, editerPalette, tousLesTags, menuNoeud,
    sauverNoeud: (n) => { sauverNoeud(n); },
    titreChange: (n) => { carte.redessiner(); },
    ferme: () => { dessinerNotes(); carte.reindexer(); carte.redessiner(); majSelection(parId.get(carte.selection) || null); majRecherchePlace(); },
  });
  function majRecherchePlace() { if (!$('recherche').classList.contains('cache')) majRecherche(); }
  function ouvrirNoeud(n) { if (modeLien) finirRelier(); editeur.ouvrir(n); }
  function voirSurCarte(n) { editeur.fermer(); aller('carte'); setTimeout(() => carte.choisir(n.id, true), 80); }

  /* ---------- onglets ---------- */
  function aller(v) {
    vueCourante = v;
    document.querySelectorAll('.vue').forEach((e) => e.classList.toggle('actif', e.id === 'vue-' + v));
    document.querySelectorAll('#onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.v === v));
    carte.activer(v === 'carte');
    if (v === 'notes') dessinerNotes();
    if (v === 'reglages') dessinerReglages();
    majVide();
  }
  document.querySelectorAll('#onglets button').forEach((b) => { b.onclick = () => aller(b.dataset.v); });

  /* ---------- réglages ---------- */
  async function dessinerReglages() {
    const p = $('r-palette'); p.innerHTML = '';
    etat.meta.palette.forEach((c) => { const d = document.createElement('span'); d.className = 'pa'; d.innerHTML = '<i style="background:' + esc(c.c) + '"></i>' + esc(c.nom || '—'); p.appendChild(d); });
    const sw = $('r-anim'); sw.setAttribute('aria-checked', etat.meta.animer !== false); sw.querySelector('.sw').classList.toggle('on', etat.meta.animer !== false);
    let txt = etat.noeuds.length + (etat.noeuds.length > 1 ? ' sommets' : ' sommet') + ' · ' + etat.liens.length + (etat.liens.length > 1 ? ' liens' : ' lien');
    try {
      if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); txt += ' · ' + CE.taille(e.usage || 0) + ' utilisés'; }
      if (navigator.storage && navigator.storage.persisted) txt += (await navigator.storage.persisted()) ? ' · stockage protégé' : '';
    } catch (e) { /* rien */ }
    $('r-stock').textContent = txt;
  }
  $('r-palette-edit').onclick = editerPalette;
  $('r-anim').onclick = () => { etat.meta.animer = etat.meta.animer === false; sauverMeta(); dessinerReglages(); carte.redessiner(); };
  $('r-exemple').onclick = () => { ajouterExemple(); toast('Exemple ajouté'); aller('carte'); setTimeout(() => carte.recentrer(), 100); };
  $('r-efface').onclick = async () => {
    if (!(await confirmer('Tout effacer ?', 'Tous tes sommets, notes et pièces jointes seront supprimés de cet iPhone. Fais une sauvegarde avant si tu hésites.', 'Tout effacer', true))) return;
    await DB.vider(); location.reload();
  };

  /* ---------- sauvegarde / restauration ---------- */
  async function exporter() {
    try {
      await flush(); editeur.sauverMaintenant();
      const fich = await DB.tout('fichiers');
      const entete = JSON.stringify({ v: 1, date: Date.now(), noeuds: etat.noeuds.map(pur), liens: etat.liens, meta: etat.meta, fichiers: fich.map((f) => ({ id: f.id, nom: f.nom, type: f.type, taille: f.blob.size })) });
      const hb = new TextEncoder().encode(entete), len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, hb.length);
      const blob = new Blob(['CERV1\n', len, hb, ...fich.map((f) => f.blob)], { type: 'application/octet-stream' });
      const nom = 'cerveau-' + new Date().toISOString().slice(0, 10) + '.cerveau';
      const f = new File([blob], nom, { type: 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: 'Sauvegarde Cerveau' }); toast('Sauvegarde prête'); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 20000); toast('Sauvegarde téléchargée');
    } catch (e) { toast('La sauvegarde a échoué'); }
  }
  async function importer(fichier) {
    try {
      if ((await fichier.slice(0, 6).text()) !== 'CERV1\n') throw new Error('format');
      const len = new DataView(await fichier.slice(6, 10).arrayBuffer()).getUint32(0);
      const tete = JSON.parse(await fichier.slice(10, 10 + len).text());
      if (!(await confirmer('Restaurer cette sauvegarde ?', tete.noeuds.length + ' sommets, ' + tete.liens.length + ' liens' + (tete.date ? ', du ' + dateFr(tete.date, { day: 'numeric', month: 'long', year: 'numeric' }) : '') + '. Ce qui est dans l\'appli maintenant sera remplacé.', 'Restaurer', true))) return;
      await DB.vider();
      let off = 10 + len;
      for (const f of tete.fichiers) {
        const b = new Blob([await fichier.slice(off, off + f.taille).arrayBuffer()], { type: f.type });
        await DB.mettre('fichiers', [{ id: f.id, nom: f.nom, type: f.type, taille: f.taille, blob: b }]); off += f.taille;
      }
      await DB.mettre('noeuds', tete.noeuds.map((n) => pur(completer(n)))); await DB.mettre('liens', tete.liens);
      await DB.mettre('meta', [{ cle: 'palette', valeur: (tete.meta && tete.meta.palette) || PALETTE_DEFAUT }, { cle: 'animer', valeur: !tete.meta || tete.meta.animer !== false }]);
      location.reload();
    } catch (e) { toast("Ce fichier n'est pas une sauvegarde Cerveau"); }
  }
  $('r-export').onclick = exporter;
  $('r-import').onclick = () => { $('f-import').value = ''; $('f-import').click(); };
  $('f-import').onchange = () => { const f = $('f-import').files[0]; if (f) importer(f); };

  /* ---------- exemple ---------- */
  function ajouterExemple() {
    const surl = (c, t) => '<span style="background-color: rgba(' + c + ', 0.42);">' + t + '</span>';
    const mk = (titre, parent, o) => creerNoeud(titre, parent, o);
    const phi = mk('Philosophie', null, { forme: 'dodeca', couleur: '#c084fc', tags: ['philo'] });
    const meta = mk('Métaphysique', phi, { forme: 'octa', couleur: '#6ea8ff', tags: ['philo', 'concept'],
      html: '<h2>Qu\'est-ce que l\'être ?</h2><div>La métaphysique étudie ' + surl('91,155,255', 'ce qui existe') + ' au-delà de l\'expérience.</div><div><span class="coche" contenteditable="false" data-on="1"></span>&#8203;Relire Aristote</div><div><span class="coche" contenteditable="false" data-on="0"></span>&#8203;Résumer la vidéo</div><div class="yt" contenteditable="false" data-yt="dQw4w9WgXcQ"><a href="https://youtu.be/dQw4w9WgXcQ" target="_blank" rel="noopener"><img src="https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" alt="" onerror="this.style.display=\'none\'"><span>Vidéo YouTube — résumé à écrire en dessous</span></a></div><div>' + surl('255,91,91', 'Idée clé') + ' : tout sommet peut en relier un autre.</div>', texte: 'Qu\'est-ce que l\'être ? La métaphysique étudie ce qui existe au-delà de l\'expérience. Relire Aristote Résumer la vidéo Idée clé : tout sommet peut en relier un autre.' });
    mk('Éthique', phi, { forme: 'icosa', couleur: '#ff9f5a', tags: ['philo'] });
    const maths = mk('Mathématiques', null, { forme: 'cube', couleur: '#5ee0a0', tags: ['maths'] });
    const ana = mk('Analyse', maths, { forme: 'penta', couleur: '#4fd8e8', tags: ['maths', 'prépa'] });
    mk('Intégrales', ana, { forme: 'tetra', couleur: '#ffd166', tags: ['maths', 'prépa'],
      html: '<h1>Théorème fondamental</h1><div>Si $f$ est continue sur $[a,b]$ et $F$ est une primitive de $f$ :</div><div>$$\\int_a^b f(x)\\,dx = F(b) - F(a)$$</div><div>' + surl('255,210,63', 'À revoir') + ' : la démonstration avec $F(x)=\\int_a^x f(t)\\,dt$.</div>', texte: 'Théorème fondamental Si f est continue sur [a,b] et F est une primitive de f : \\int_a^b f(x) dx = F(b) - F(a) À revoir : la démonstration' });
    mk('Séries', ana, { forme: 'sphere', couleur: '#e8e8ee', tags: ['maths'] });
    const jour = mk('Journal', null, { forme: 'sphere', couleur: '#ff6b6b', tags: ['journée'] });
    mk('Livres à résumer', jour, { forme: 'cube', couleur: '#e8e8ee', tags: ['livre'] });
    const lien = { id: nouvelId(), a: meta.id, b: ana.id }; etat.liens.push(lien); DB.mettre('liens', [lien]).catch(() => {});
    carte.reindexer(); carte.reveiller(1.4); dessinerNotes(); majVide();
  }

  /* ---------- démarrage ---------- */
  async function demarrer() {
    const ok = await DB.ouvrir();
    if (ok) {
      const [ns, ls, ms] = await Promise.all([DB.tout('noeuds'), DB.tout('liens'), DB.tout('meta')]);
      etat.noeuds = ns.map(completer); etat.liens = ls;
      ms.forEach((m) => { if (m.cle === 'palette' && Array.isArray(m.valeur) && m.valeur.length) etat.meta.palette = m.valeur; if (m.cle === 'animer') etat.meta.animer = m.valeur !== false; });
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* rien */ }
    }
    indexer();
    carte = CC.creer($('cv'), etat, {
      selection: (n) => { if (n) majSelection(n); else { $('carte-sel').classList.add('cache'); } },
      ouvrir: ouvrirNoeud,
      relier: basculerLien,
      annulerRelier: () => {},
      deplace: (n) => { sauverNoeud(n); },
      positionsStables: sauverPositions,
    });
    indexer();
    aller('carte');
    if (etat.noeuds.length) { carte.recentrer(); carte.reveiller(0.25); }
    if (!ok) toast("Stockage indisponible : tes notes ne seront pas gardées (désactive la navigation privée)");
    setTimeout(nettoyerFichiers, 4000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    self.CerveauApp = { etat, carte, editeur, creerNoeud, ouvrirNoeud, aller, parId, ajouterExemple, exporter, modale: { saisie, confirmer } };
  }
  demarrer();
})();
