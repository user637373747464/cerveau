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
    journal: svg('<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11M9 8h6"/>'),
    jours: svg('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/><circle cx="12" cy="15" r="1.3" fill="currentColor"/>'),
    gauche: svg('<path d="M15 5l-7 7 7 7"/>', ' stroke-width="2.4"'),
    droite: svg('<path d="M9 5l7 7-7 7"/>', ' stroke-width="2.4"'),
    reglages: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  };
  $('b-loupe').innerHTML = IC.loupe; $('b-centrer').innerHTML = IC.centrer; $('b-plus').innerHTML = IC.plus;
  $('b-jours').innerHTML = IC.jours; $('j-prec').innerHTML = IC.gauche; $('j-suiv').innerHTML = IC.droite; $('ic-journal').innerHTML = IC.journal; $('ic-carte').innerHTML = IC.carte; $('ic-notes').innerHTML = IC.notes; $('ic-reglages').innerHTML = IC.reglages;

  /* ---------- données ---------- */
  const PALETTE_DEFAUT = [
    { c: '#5b9bff', nom: 'Définition' }, { c: '#ff5b5b', nom: 'Important' }, { c: '#43d68c', nom: 'Exemple' },
    { c: '#ffd23f', nom: 'À revoir' }, { c: '#b47cff', nom: 'Idée' }, { c: '#ff9a4d', nom: 'Question' },
  ];
  const COULEURS_NOEUD = ['#e8e8ee', '#ffffff', '#9a9aa5', '#ff6b6b', '#ff4d6d', '#ff9f5a', '#ffb703', '#ffd166', '#f4ee6b', '#b8e65a', '#5ee0a0', '#2fbf71',
    '#4fd8e8', '#38bdf8', '#6ea8ff', '#4361ee', '#8b7bff', '#c084fc', '#e879f9', '#ff7eb6', '#d4a373', '#8d6e63', '#5fa8a0', '#2a9d8f'];
  const COULEUR_JOUR = '#ffd166';
  const etat = { noeuds: [], liens: [], meta: { palette: PALETTE_DEFAUT.map((p) => ({ ...p })), animer: true, orbites: true, jours: true, couleursPerso: [], derniereSauvegarde: null } };
  const parId = new Map();
  let carte = null, editeur = null, vueCourante = 'carte', modeLien = false;
  const dateFr = (t, o) => new Date(t).toLocaleDateString('fr-FR', o || { day: 'numeric', month: 'short' });
  const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function pur(n) { return { id: n.id, titre: n.titre, html: n.html, texte: n.texte, tags: n.tags, x: n.x, y: n.y, z: n.z, forme: n.forme, couleur: n.couleur, taille: n.taille || 2, fixe: !!n.fixe, jour: n.jour || null, cree: n.cree, modifie: n.modifie }; }
  function completer(n) {
    return { id: n.id || nouvelId(), titre: n.titre || '', html: n.html || '', texte: n.texte || '', tags: Array.isArray(n.tags) ? n.tags : [], x: +n.x || 0, y: +n.y || 0, z: +n.z || 0,
      forme: n.forme || 'sphere', couleur: n.couleur || COULEURS_NOEUD[0], taille: [1, 2, 3, 4, 5].includes(+n.taille) ? +n.taille : 2, fixe: !!n.fixe, jour: n.jour || null, cree: n.cree || Date.now(), modifie: n.modifie || Date.now() };
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
  const CLES_META = ['palette', 'animer', 'orbites', 'jours', 'couleursPerso', 'derniereSauvegarde'];
  function sauverMeta() { DB.mettre('meta', CLES_META.map((cle) => ({ cle, valeur: etat.meta[cle] }))).catch(() => {}); }
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
  // lien : on colle depuis le presse-papiers, sans ouvrir le clavier
  function lienColle(titre) {
    return new Promise((res) => {
      ouvrirModale('<h3>' + esc(titre || 'Ajouter un lien') + '</h3><p>Copie ton lien (YouTube, site, PDF…) puis touche « Coller ».</p>' +
        '<button class="act plein gros" id="m-coller">Coller le lien</button>' +
        '<div id="m-secours" class="cache"><p class="petit">Si rien ne se passe : appuie longtemps dans le cadre ci-dessous, puis « Coller ».</p><input id="m-in" type="text" inputmode="none" placeholder="Appui long ici → Coller" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
        '<div class="boutons"><button class="act" id="m-non">Annuler</button></div>', (boite, fermer) => {
        const fin = (v) => { fermer(); res(v); };
        const inp = boite.querySelector('#m-in');
        boite.querySelector('#m-non').onclick = () => fin(null);
        $('modale')._annuler = () => fin(null);
        const secours = () => { boite.querySelector('#m-secours').classList.remove('cache'); };
        inp.addEventListener('input', () => { if (inp.value.trim()) fin(inp.value.trim()); });
        boite.querySelector('#m-coller').onclick = async () => {
          try {
            const t = ((await navigator.clipboard.readText()) || '').trim();
            if (t) fin(t); else { toast('Presse-papiers vide : copie d\'abord ton lien'); }
          } catch (e) { secours(); }
        };
      });
    });
  }
  function choix(titre, texte, opts) {
    return new Promise((res) => {
      ouvrirModale('<h3>' + esc(titre) + '</h3>' + (texte ? '<p>' + esc(texte) + '</p>' : '') + opts.map((o, i) => '<button class="act gros' + (o.plein ? ' plein' : '') + '" data-i="' + i + '">' + esc(o.label) + '</button>').join(''), (boite, fermer) => {
        const fin = (v) => { fermer(); res(v); };
        boite.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => fin(+b.dataset.i); });
        $('modale')._annuler = () => fin(null);
      });
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
    const t = document.createElement('div'); t.className = 'tailles';
    [[5, 'Très petit', 7], [1, 'Petit', 11], [2, 'Moyen', 16], [3, 'Grand', 22], [4, 'Très grand', 30]].forEach(([v, nom, d]) => {
      const b = document.createElement('button'); b.className = 'taille' + ((n.taille || 2) === v ? ' on' : ''); b.innerHTML = '<i style="width:' + d + 'px;height:' + d + 'px"></i>' + nom;
      b.onclick = () => { n.taille = v; n.modifie = Date.now(); sauverNoeud(n); carte.reindexer(); carte.reveiller(0.5); carte.redessiner(); construireAspect(cont, n); };
      t.appendChild(b);
    });
    const c = document.createElement('div'); c.className = 'couleurs';
    const choisirCouleur = (col) => { n.couleur = col; n._rgb = null; n.modifie = Date.now(); sauverNoeud(n); carte.redessiner(); };
    const toutes = COULEURS_NOEUD.concat(etat.meta.couleursPerso || [], etat.meta.palette.map((p) => p.c)).map((x) => x.toLowerCase());
    // couleur sur mesure : le sélecteur de couleurs d'iOS (roue, curseurs, pipette)
    const perso = document.createElement('label'); perso.className = 'pastille perso'; perso.setAttribute('aria-label', 'Autre couleur');
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = /^#[0-9a-f]{6}$/i.test(n.couleur || '') ? n.couleur : '#ffffff';
    inp.oninput = () => choisirCouleur(inp.value);
    inp.onchange = () => {
      const col = inp.value.toLowerCase();
      if (!toutes.includes(col)) { etat.meta.couleursPerso = [col].concat(etat.meta.couleursPerso || []).slice(0, 14); sauverMeta(); }
      choisirCouleur(col); construireAspect(cont, n);
    };
    perso.appendChild(inp);
    c.appendChild(perso);
    toutes.filter((x, i, a) => a.indexOf(x) === i).forEach((col) => {
      const b = document.createElement('button'); b.className = 'pastille' + ((n.couleur || '').toLowerCase() === col ? ' on' : ''); b.style.background = col; b.setAttribute('aria-label', col);
      b.onclick = () => { choisirCouleur(col); construireAspect(cont, n); };
      c.appendChild(b);
    });
    cont.appendChild(f); cont.appendChild(t); cont.appendChild(c);
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
  const surOrbite = (n) => !!(n._j || carte.parentDe(n));
  const libelleEpingle = (n) => (n.fixe ? (surOrbite(n) ? (n._j ? 'Sur son anneau' : "Sur l'orbite") : 'Libérer') : 'Fixer');
  function basculerEpingle(n) {
    if (n.fixe && surOrbite(n)) { n.fixe = false; toast(n._j ? 'Le jour est revenu sur son anneau' : "Remis sur l'orbite"); }
    else { n.fixe = !n.fixe; toast(n.fixe ? 'Sommet fixé : il ne bouge plus' : 'Sommet libéré'); }
    sauverNoeud(n); carte.reindexer(); carte.reveiller(0.7);
  }
  function majSelection(n) {
    const box = $('carte-sel');
    if (!n) { box.classList.add('cache'); return; }
    if (modeLien) return;
    box.classList.remove('cache');
    $('cs-nom').textContent = n.titre || 'Sans titre';
    const deg = etat.liens.filter((l) => l.a === n.id || l.b === n.id).length;
    $('cs-info').textContent = deg + (deg > 1 ? ' liens' : ' lien') + (n.tags.length ? ' · ' + n.tags.map((t) => '#' + t).join(' ') : '');
    box.querySelector('[data-a=epingle]').textContent = libelleEpingle(n);
    const pinnes = carte.enfantsDe(n).filter((c) => c.fixe).length;
    const bo = box.querySelector('[data-a=ranger]'); bo.classList.toggle('cache', !pinnes);
    bo.textContent = pinnes > 1 ? 'Ranger ses enfants' : 'Ranger son enfant';
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
    } else if (a === 'epingle') { basculerEpingle(n); majSelection(n); }
    else if (a === 'ranger') { carte.enfantsDe(n).forEach((c) => { if (c.fixe) { c.fixe = false; sauverNoeud(c); } }); carte.reindexer(); carte.reveiller(0.8); majSelection(n); toast("Enfants remis sur l'orbite"); }
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
    else { const l = { id: nouvelId(), a: s.id, b: n.id, t: 'ref' }; etat.liens.push(l); DB.mettre('liens', [l]).catch(() => {}); toast('Relié à « ' + (n.titre || 'Sans titre').slice(0, 24) + ' »'); }
    carte.reindexer(); carte.reveiller(0.8);
  }

  function lierRef(a, b) {                      // mention d'une page dans une autre : un lien d'association sur la carte (sans orbite)
    if (!a || !b || a === b) return;
    if (etat.liens.some((l) => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id))) return;
    const l = { id: nouvelId(), a: a.id, b: b.id, t: 'ref' };
    etat.liens.push(l); DB.mettre('liens', [l]).catch(() => {});
    carte.reindexer(); carte.reveiller(0.6);
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
  function ouvrirRecherche() { $('zones').classList.add('cache'); $('recherche').classList.remove('cache'); majRecherche(); setTimeout(() => $('q').focus(), 50); }
  function fermerRecherche() { zoneActive = null; sigZones = ''; $('recherche').classList.add('cache'); $('q').value = ''; $('q').blur(); tagsActifs = new Set(); carte.definirFiltre(null); dessinerZones(true); }
  $('b-loupe').onclick = () => ($('recherche').classList.contains('cache') ? ouvrirRecherche() : fermerRecherche());
  $('q').addEventListener('input', majRecherche);
  $('b-centrer').onclick = () => { zoneActive = null; carte.definirFiltre(null); carte.recentrer(); dessinerZones(true); };

  /* --- zones : un bouton par grand thème (tag utilisé par au moins 5 sommets) --- */
  let zoneActive = null, sigZones = '';
  function dessinerZones(force) {
    const box = $('zones'); if (!box) return;
    const cpt = new Map();
    etat.noeuds.forEach((n) => { if (n.jour) return; n.tags.forEach((g) => cpt.set(g, (cpt.get(g) || 0) + 1)); });
    const liste = [...cpt].filter(([, c]) => c >= 5).sort((a, b) => b[1] - a[1]);
    const sig = liste.map(([g, c]) => g + c).join('|') + '#' + zoneActive;
    if (!force && sig === sigZones) return;
    sigZones = sig; box.innerHTML = '';
    if (!liste.length) { box.classList.add('cache'); return; }
    box.classList.remove('cache');
    const mk = (txt, on, fn) => { const b = document.createElement('button'); b.className = 'puce' + (on ? ' on' : ''); b.innerHTML = txt; b.onclick = fn; box.appendChild(b); };
    mk('Tout', !zoneActive, () => { zoneActive = null; carte.definirFiltre(null); carte.recentrer(); dessinerZones(true); });
    liste.forEach(([g, c]) => mk(esc(g.charAt(0).toUpperCase() + g.slice(1)) + '<small>' + c + '</small>', zoneActive === g, () => {
      if (zoneActive === g) { zoneActive = null; carte.definirFiltre(null); carte.recentrer(); }
      else {
        zoneActive = g;
        const ids = new Set(etat.noeuds.filter((n) => !n.jour && n.tags.includes(g)).map((n) => n.id));
        carte.definirFiltre(ids); carte.cadrer(ids);
      }
      dessinerZones(true);
    }));
  }
  setInterval(() => { if (!$('recherche').classList.contains('cache')) return; dessinerZones(false); }, 1500);
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
        '<div class="meta">' + (n.jour ? '<span class="tag">📅 journal</span>' : '') + n.tags.map((t) => '<span class="tag">#' + esc(t) + '</span>').join('') + '<span class="quand">' + dateFr(n.modifie) + '</span></div>';
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
  $('n-jour').onclick = () => ouvrirJour(cleDe(new Date()));

  /* ---------- journal : une page vierge par jour ---------- */
  const cleDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dateDeCle = (c) => { const p = c.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const maj1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const titreAuto = (cle) => maj1(dateFr(dateDeCle(cle), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  const aContenu = (n) => (n.texte || '').replace(/\s+/g, '').length > 0 || /data-f=/.test(n.html || '');
  const aPhotos = (n) => /<(img|video)[^>]*data-f=/.test(n.html || '');
  const titreParDefaut = (n) => n.titre === titreAuto(n.jour) || /^Journée · /.test(n.titre || '') || !n.titre;
  let moisVu = (() => { const d = new Date(); return { a: d.getFullYear(), m: d.getMonth() }; })();
  let urlsVignettes = [];

  function ouvrirJour(cle) {
    let n = etat.noeuds.find((x) => x.jour === cle);
    if (!n) n = creerNoeud(titreAuto(cle), null, { jour: cle, couleur: COULEUR_JOUR, taille: 1 });
    const aujourdhui = cle === cleDe(new Date());
    ouvrirNoeud(n, { mode: aujourdhui || !aContenu(n) ? 'ecrire' : 'lire' });
  }
  function retirerSiVide(n) {                    // une page de jour restée vierge ne laisse aucune trace
    if (!n || !n.jour || aContenu(n) || !titreParDefaut(n) || n.tags.length) return;
    if (etat.liens.some((l) => l.a === n.id || l.b === n.id)) return;
    if (etat.noeuds.some((x) => x !== n && (x.html || '').includes('data-n="' + n.id + '"'))) return;
    etat.noeuds = etat.noeuds.filter((x) => x !== n); file.delete(n.id);
    DB.supprimer('noeuds', [n.id]).catch(() => {});
    if (carte.selection === n.id) carte.choisir(null);
    indexer(); carte.reveiller(0.4); dessinerNotes(); majVide();
  }
  async function vignette(n, img) {
    const tmp = document.createElement('div'); tmp.innerHTML = n.html || '';
    const premiere = [...tmp.querySelectorAll('img[data-f]')].find((i) => !i.closest('.spoil')); if (!premiere) return;
    try {
      const f = await DB.lire('fichiers', premiere.getAttribute('data-f'));
      if (f && f.blob) { const u = URL.createObjectURL(f.blob); urlsVignettes.push(u); img.src = u; img.classList.remove('cache'); }
    } catch (e) { /* tant pis */ }
  }
  function dessinerJournal() {
    urlsVignettes.forEach((u) => URL.revokeObjectURL(u)); urlsVignettes = [];
    const { a, m } = moisVu, auj = cleDe(new Date());
    const parJour = new Map(); etat.noeuds.forEach((n) => { if (n.jour && /^\d{4}-\d{2}-\d{2}$/.test(n.jour)) parJour.set(n.jour, n); });
    const ecrits = [...parJour.values()].filter(aContenu);
    const ceMois = ecrits.filter((n) => n.jour.startsWith(a + '-' + String(m + 1).padStart(2, '0'))).length;
    $('j-mois').textContent = maj1(new Date(a, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
    $('j-stats').textContent = ecrits.length ? ecrits.length + (ecrits.length > 1 ? ' jours écrits' : ' jour écrit') + ' · ' + ceMois + ' ce mois-ci' : 'Ton journal de bord est encore vide. Chaque jour, une page vierge.';
    const nAuj = parJour.get(auj);
    $('j-auj').textContent = nAuj && aContenu(nAuj) ? "Continuer aujourd'hui" : "Écrire aujourd'hui";
    const g = $('j-grille'); g.innerHTML = '';
    const decal = (new Date(a, m, 1).getDay() + 6) % 7, nbj = new Date(a, m + 1, 0).getDate();
    for (let i = 0; i < decal; i++) g.appendChild(document.createElement('span'));
    for (let j = 1; j <= nbj; j++) {
      const cle = a + '-' + String(m + 1).padStart(2, '0') + '-' + String(j).padStart(2, '0'), n = parJour.get(cle);
      const b = document.createElement('button'); b.className = 'cj' + (cle === auj ? ' auj' : '') + (cle > auj ? ' fut' : '');
      const ec = n && aContenu(n);
      b.innerHTML = '<span>' + j + '</span><em>' + (ec ? '<i class="d"></i>' : '') + (ec && aPhotos(n) ? '<i class="d p"></i>' : '') + '</em>';
      b.setAttribute('aria-label', titreAuto(cle));
      b.onclick = () => ouvrirJour(cle);
      g.appendChild(b);
    }
    $('j-liste-titre').textContent = ceMois ? 'Ce mois-ci' : '';
    const liste = $('j-liste'); liste.innerHTML = '';
    ecrits.filter((n) => n.jour.startsWith(a + '-' + String(m + 1).padStart(2, '0'))).sort((x, y) => (y.jour < x.jour ? -1 : 1)).forEach((n) => {
      const b = document.createElement('button'); b.className = 'note jour-ligne';
      const d = dateDeCle(n.jour);
      b.innerHTML = '<div class="jl-date"><small>' + esc(d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')) + '</small><b>' + d.getDate() + '</b></div>' +
        '<div class="jl-txt"><b>' + esc(titreParDefaut(n) ? maj1(dateFr(d, { weekday: 'long', day: 'numeric', month: 'long' })) : n.titre) + '</b><p>' + esc((n.texte || '').slice(0, 140) || (aPhotos(n) ? 'Photos' : 'Pièce jointe')) + '</p></div>' +
        (aPhotos(n) ? '<img class="jl-img cache" alt="">' : '');
      b.onclick = () => ouvrirJour(n.jour);
      liste.appendChild(b);
      const im = b.querySelector('.jl-img'); if (im) vignette(n, im);
    });
  }
  function changerMois(d) { let m = moisVu.m + d, a = moisVu.a; if (m < 0) { m = 11; a--; } if (m > 11) { m = 0; a++; } moisVu = { a, m }; dessinerJournal(); }
  $('j-prec').onclick = () => changerMois(-1); $('j-suiv').onclick = () => changerMois(1);
  $('j-mois').onclick = () => { const d = new Date(); moisVu = { a: d.getFullYear(), m: d.getMonth() }; dessinerJournal(); };
  $('j-auj').onclick = () => { const d = new Date(); moisVu = { a: d.getFullYear(), m: d.getMonth() }; ouvrirJour(cleDe(d)); };
  $('j-sauve').onclick = () => exporter();

  /* ---------- éditeur ---------- */
  function menuNoeud(n, menu, fermer) {
    const bouton = (txt, f, cl) => { const b = document.createElement('button'); b.textContent = txt; if (cl) b.className = cl; b.onclick = f; menu.appendChild(b); return b; };
    bouton('Voir sur la carte', () => { fermer(); voirSurCarte(n); });
    const zone = document.createElement('div'); zone.className = 'aspect cache';
    bouton('Forme et couleur', () => { zone.classList.toggle('cache'); if (!zone.classList.contains('cache')) construireAspect(zone, n); });
    menu.appendChild(zone);
    bouton(libelleEpingle(n) === 'Fixer' ? 'Fixer la position' : libelleEpingle(n) === 'Libérer' ? 'Libérer la position' : libelleEpingle(n), () => { basculerEpingle(n); fermer(); });
    bouton('Supprimer ce sommet', () => { fermer(); supprimerNoeud(n); }, 'danger');
  }
  editeur = CE.creer({
    DB, etat, icones: { retour: IC.retour, oeil: IC.oeil, crayon: IC.crayon, plus3: IC.plus3 },
    modale: { saisie, lienColle, choix }, parId, creerNoeud: (t, p) => creerNoeud(t, p), lierRef, toast, palette: () => etat.meta.palette, editerPalette, tousLesTags, menuNoeud,
    sauverNoeud: (n) => { sauverNoeud(n); },
    titreChange: (n) => { carte.redessiner(); },
    ferme: (noeud) => { retirerSiVide(noeud); dessinerNotes(); if (vueCourante === 'journal') dessinerJournal(); carte.reindexer(); carte.redessiner(); majSelection(parId.get(carte.selection) || null); majRecherchePlace(); },
  });
  function majRecherchePlace() { if (!$('recherche').classList.contains('cache')) majRecherche(); }
  function ouvrirNoeud(n, options) { if (modeLien) finirRelier(); editeur.ouvrir(n, options); }
  function voirSurCarte(n) { editeur.fermer(); aller('carte'); setTimeout(() => carte.choisir(n.id, true), 80); }

  /* ---------- onglets ---------- */
  function aller(v) {
    vueCourante = v;
    document.querySelectorAll('.vue').forEach((e) => e.classList.toggle('actif', e.id === 'vue-' + v));
    document.querySelectorAll('#onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.v === v));
    carte.activer(v === 'carte');
    if (v === 'notes') dessinerNotes();
    if (v === 'journal') dessinerJournal();
    if (v === 'reglages') dessinerReglages();
    majVide();
  }
  document.querySelectorAll('#onglets button').forEach((b) => { b.onclick = () => aller(b.dataset.v); });

  /* ---------- réglages ---------- */
  async function dessinerReglages() {
    const p = $('r-palette'); p.innerHTML = '';
    etat.meta.palette.forEach((c) => { const d = document.createElement('span'); d.className = 'pa'; d.innerHTML = '<i style="background:' + esc(c.c) + '"></i>' + esc(c.nom || '—'); p.appendChild(d); });
    [['r-anim', etat.meta.animer !== false], ['r-orb', etat.meta.orbites !== false], ['r-jours', etat.meta.jours !== false]].forEach(([id, on]) => { const sw = $(id); sw.setAttribute('aria-checked', on); sw.querySelector('.sw').classList.toggle('on', on); });
    $('b-jours').classList.toggle('off', etat.meta.jours === false);
    const ds = etat.meta.derniereSauvegarde;
    $('r-derniere').textContent = ds ? 'Dernière sauvegarde : ' + dateFr(ds, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : "Tu n'as encore jamais fait de sauvegarde.";
    $('r-derniere').style.color = ds ? '' : '#ffb454';
    let txt = etat.noeuds.length + (etat.noeuds.length > 1 ? ' sommets' : ' sommet') + ' · ' + etat.liens.length + (etat.liens.length > 1 ? ' liens' : ' lien');
    try {
      if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); txt += ' · ' + CE.taille(e.usage || 0) + ' utilisés'; }
      if (navigator.storage && navigator.storage.persisted) txt += (await navigator.storage.persisted()) ? ' · stockage protégé' : '';
    } catch (e) { /* rien */ }
    $('r-stock').textContent = txt;
  }
  $('r-palette-edit').onclick = editerPalette;
  $('r-anim').onclick = () => { etat.meta.animer = etat.meta.animer === false; sauverMeta(); dessinerReglages(); carte.redessiner(); };
  $('r-orb').onclick = () => { etat.meta.orbites = etat.meta.orbites === false; sauverMeta(); dessinerReglages(); carte.reindexer(); carte.reveiller(1); toast(etat.meta.orbites ? 'Orbites activées' : 'Orbites désactivées'); };
  function basculerJours() { etat.meta.jours = etat.meta.jours === false; sauverMeta(); dessinerReglages(); carte.reindexer(); carte.reveiller(0.3); if (vueCourante === 'carte') toast(etat.meta.jours ? 'Jours du journal affichés' : 'Jours du journal cachés'); }
  $('r-jours').onclick = basculerJours; $('b-jours').onclick = basculerJours;
  $('r-ranger').onclick = () => { etat.noeuds.forEach((n) => { if (n.fixe && (n._j || carte.parentDe(n))) { n.fixe = false; file.add(n.id); } }); sauverPositions(); carte.reindexer(); carte.reveiller(1); toast('Tout est remis sur les orbites'); aller('carte'); };
  $('r-exemple').onclick = () => { ajouterExemple(); toast('Exemple ajouté'); aller('carte'); setTimeout(() => carte.recentrer(), 100); };
  $('r-efface').onclick = async () => {
    if (!(await confirmer('Tout effacer ?', 'Tous tes sommets, notes et pièces jointes seront supprimés de cet iPhone. Fais une sauvegarde avant si tu hésites.', 'Tout effacer', true))) return;
    await DB.vider(); location.reload();
  };

  /* ---------- sauvegarde / restauration ---------- */
  async function exporter() {
    try {
      toast('Préparation de la sauvegarde…');
      await flush(); editeur.sauverMaintenant(); await flush();
      const fich = await DB.tout('fichiers');
      const meta = {}; CLES_META.forEach((c) => { meta[c] = etat.meta[c]; });
      const entete = JSON.stringify({ v: 4, date: Date.now(), noeuds: etat.noeuds.map(pur), liens: etat.liens, meta, fichiers: fich.map((f) => ({ id: f.id, nom: f.nom, type: f.type, taille: f.blob.size })) });
      const hb = new TextEncoder().encode(entete), len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, hb.length);
      const blob = new Blob(['CERV1\n', len, hb, ...fich.map((f) => f.blob)], { type: 'application/octet-stream' });
      const nom = 'cerveau-' + new Date().toISOString().slice(0, 10) + '.cerveau';
      const f = new File([blob], nom, { type: 'application/octet-stream' });
      const marquer = () => { etat.meta.derniereSauvegarde = Date.now(); sauverMeta(); if (vueCourante === 'reglages') dessinerReglages(); };
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: 'Sauvegarde Cerveau' }); marquer(); toast('Sauvegarde prête (' + CE.taille(blob.size) + ')'); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 20000); marquer(); toast('Sauvegarde téléchargée (' + CE.taille(blob.size) + ')');
    } catch (e) { toast('La sauvegarde a échoué'); }
  }
  async function importer(fichier) {
    try {
      if ((await fichier.slice(0, 6).text()) !== 'CERV1\n') throw new Error('format');
      const len = new DataView(await fichier.slice(6, 10).arrayBuffer()).getUint32(0);
      const tete = JSON.parse(await fichier.slice(10, 10 + len).text());
      const nj = tete.noeuds.filter((n) => n.jour).length, nf = (tete.fichiers || []).length;
      if (!(await confirmer('Restaurer cette sauvegarde ?', tete.noeuds.length + ' sommets, ' + tete.liens.length + ' liens' + (nj ? ', ' + nj + ' jours de journal' : '') + (nf ? ', ' + nf + ' photos et fichiers' : '') + (tete.date ? ', du ' + dateFr(tete.date, { day: 'numeric', month: 'long', year: 'numeric' }) : '') + '. Ce qui est dans l\'appli maintenant sera remplacé.', 'Restaurer', true))) return;
      toast('Restauration en cours…');
      await DB.vider();
      let off = 10 + len;
      for (const f of (tete.fichiers || [])) {
        const b = new Blob([await fichier.slice(off, off + f.taille).arrayBuffer()], { type: f.type });
        await DB.mettre('fichiers', [{ id: f.id, nom: f.nom, type: f.type, taille: f.taille, blob: b }]); off += f.taille;
      }
      await DB.mettre('noeuds', tete.noeuds.map((n) => pur(completer(n)))); await DB.mettre('liens', tete.liens);
      const m = tete.meta || {};
      await DB.mettre('meta', [
        { cle: 'palette', valeur: Array.isArray(m.palette) && m.palette.length ? m.palette : PALETTE_DEFAUT },
        { cle: 'animer', valeur: m.animer !== false }, { cle: 'orbites', valeur: m.orbites !== false }, { cle: 'jours', valeur: m.jours !== false },
        { cle: 'couleursPerso', valeur: Array.isArray(m.couleursPerso) ? m.couleursPerso : [] }, { cle: 'derniereSauvegarde', valeur: tete.date || null },
      ]);
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
      ms.forEach((m) => {
        if (m.cle === 'palette' && Array.isArray(m.valeur) && m.valeur.length) etat.meta.palette = m.valeur;
        else if (m.cle === 'animer' || m.cle === 'orbites' || m.cle === 'jours') etat.meta[m.cle] = m.valeur !== false;
        else if (m.cle === 'couleursPerso' && Array.isArray(m.valeur)) etat.meta.couleursPerso = m.valeur;
        else if (m.cle === 'derniereSauvegarde') etat.meta.derniereSauvegarde = m.valeur || null;
      });
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* rien */ }
    }
    indexer();
    carte = CC.creer($('cv'), etat, {
      selection: (n) => { if (n) majSelection(n); else { $('carte-sel').classList.add('cache'); } },
      ouvrir: ouvrirNoeud,
      relier: basculerLien,
      annulerRelier: () => {},
      deplace: (n) => { sauverNoeud(n); carte.reindexer(); majSelection(n); },
      positionsStables: sauverPositions,
    });
    indexer();
    // pages de jour restées vierges (appli fermée en cours d'écriture) : on les retire en silence
    [...etat.noeuds].filter((n) => n.jour).forEach(retirerSiVide);
    indexer();
    aller('carte');
    if (etat.noeuds.length) { carte.recentrer(); carte.reveiller(0.25); }
    if (!ok) toast("Stockage indisponible : tes notes ne seront pas gardées (désactive la navigation privée)");
    setTimeout(nettoyerFichiers, 4000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    self.CerveauApp = { etat, carte, editeur, creerNoeud, ouvrirNoeud, aller, parId, ajouterExemple, exporter, ouvrirJour, cleDe, lierRef, importer, modale: { saisie, confirmer } };
  }
  demarrer();
})();
