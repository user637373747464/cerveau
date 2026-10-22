/* editeur.js — l'éditeur de note d'un sommet : mise en page, couleurs, surlignage, liens, YouTube, pièces jointes, formules $$…$$, cases à cocher. */
(function (racine) {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const taille = (o) => (o < 1e3 ? o + ' o' : o < 1e6 ? Math.round(o / 100) / 10 + ' Ko' : o < 1e9 ? (Math.round(o / 1e5) / 10 + ' Mo').replace('.', ',') : (Math.round(o / 1e7) / 100 + ' Go').replace('.', ','));
  const ZW = '​';
  const RE_YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/;
  const idYoutube = (u) => { const m = RE_YT.exec(u || ''); return m ? m[1] : null; };
  const RE_MATHS = /\$\$([\s\S]+?)\$\$|\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g;

  /* ---------- formules : transforme $$…$$ et $…$ en vraies formules (lecture seule, sur l'affichage) ---------- */
  function rendreMaths(rac) {
    if (!racine.katex) return;
    const w = document.createTreeWalker(rac, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (t.nodeValue.indexOf('$') < 0 || (t.parentElement && t.parentElement.closest('.maths,.katex')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const liste = [];
    while (w.nextNode()) liste.push(w.currentNode);
    for (const t of liste) {
      const s = t.nodeValue;
      RE_MATHS.lastIndex = 0;
      let m, dernier = 0, frag = null;
      while ((m = RE_MATHS.exec(s))) {
        frag = frag || document.createDocumentFragment();
        if (m.index > dernier) frag.appendChild(document.createTextNode(s.slice(dernier, m.index)));
        const bloc = m[1] != null;
        const sp = document.createElement('span');
        sp.className = 'maths' + (bloc ? ' bloc' : '');
        try { racine.katex.render((bloc ? m[1] : m[2]).replace(/ |​/g, ' '), sp, { displayMode: bloc, throwOnError: false, strict: 'ignore' }); }
        catch (e) { sp.textContent = m[0]; }
        frag.appendChild(sp);
        dernier = m.index + m[0].length;
      }
      if (frag) {
        if (dernier < s.length) frag.appendChild(document.createTextNode(s.slice(dernier)));
        t.parentNode.replaceChild(frag, t);
      }
    }
  }

  function creer(ctx) {
    const $ = (id) => document.getElementById(id);
    const ed = $('editeur'), corps = $('ed-corps'), titre = $('ed-titre'), tagsBox = $('ed-tags'), barre = $('ed-barre'), outils = $('ed-outils'), pop = $('ed-pop'), menu = $('ed-menu'), fpj = $('f-pj'), vis = $('visionneuse');
    let n = null, mode = 'ecrire', ouvert = false;
    const urls = new Map();
    let minuteur = null;
    let selSauvee = null;
    let base = '';                       // contenu au moment de l'ouverture : on n'enregistre que si ça change vraiment
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); document.execCommand('styleWithCSS', false, true); } catch (e) { /* tant pis */ }

    /* ---------- fichiers joints ---------- */
    async function urlFichier(id) {
      if (urls.has(id)) return urls.get(id);
      const f = await ctx.DB.lire('fichiers', id);
      if (!f || !f.blob) return null;
      const u = URL.createObjectURL(f.blob);
      urls.set(id, u);
      return u;
    }
    async function hydrater(rac) {
      for (const el of rac.querySelectorAll('img[data-f],video[data-f]')) {
        const u = await urlFichier(el.getAttribute('data-f'));
        if (u) el.src = u; else el.setAttribute('alt', 'fichier manquant');
      }
    }
    async function reduireImage(f) {
      if (f.type === 'image/gif' || f.type === 'image/svg+xml') return f;
      let bmp;
      try { bmp = await createImageBitmap(f); }
      catch (e) {
        bmp = await new Promise((ok, ko) => { const i = new Image(); const u = URL.createObjectURL(f); i.onload = () => { ok(i); }; i.onerror = () => ko(new Error('image illisible')); i.src = u; });
      }
      const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, M = 1800;
      const k = Math.min(1, M / Math.max(w, h));
      if (k === 1 && f.size < 1.5e6 && /jpeg|png|webp/.test(f.type)) return f;
      const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.86));
      return b || f;
    }
    async function ajouterFichiers(liste) {
      for (const f of liste) {
        const nom = f.name || 'fichier';
        try {
          let blob = f, type = f.type || 'application/octet-stream';
          if (/^image\//.test(type)) { blob = await reduireImage(f); type = blob.type || type; }
          const id = nouvelId();
          await ctx.DB.mettre('fichiers', [{ id, nom, type, taille: blob.size, blob }]);
          let h;
          if (/^image\//.test(type)) h = '<div><img data-f="' + id + '" alt="' + esc(nom) + '"></div><div><br></div>';
          else if (/^video\//.test(type)) h = '<div><video data-f="' + id + '" controls playsinline preload="metadata"></video></div><div><br></div>';
          else h = '<div><a class="fichier" data-f="' + id + '" data-nom="' + esc(nom) + '" data-type="' + esc(type) + '" contenteditable="false">📎 ' + esc(nom) + '<small>' + taille(blob.size) + '</small></a></div><div><br></div>';
          inserer(h);
          await hydrater(corps);
          ctx.toast('« ' + nom.slice(0, 28) + ' » ajouté');
        } catch (e) { ctx.toast("Impossible d'ajouter « " + nom.slice(0, 24) + ' »'); }
      }
      synchroniser();
    }
    async function ouvrirFichier(id) {
      const f = await ctx.DB.lire('fichiers', id);
      if (!f) { ctx.toast('Fichier introuvable'); return; }
      const u = await urlFichier(id);
      vis.innerHTML = '';
      const hd = document.createElement('div'); hd.className = 'vh';
      const bOuvrir = document.createElement('a'); bOuvrir.className = 'act'; bOuvrir.textContent = 'Ouvrir à part'; bOuvrir.href = u; bOuvrir.target = '_blank'; bOuvrir.rel = 'noopener'; bOuvrir.style.textDecoration = 'none'; bOuvrir.style.color = 'inherit';
      const bF = document.createElement('button'); bF.className = 'act plein'; bF.textContent = 'Fermer'; bF.onclick = () => vis.classList.add('cache');
      if (!/^image\//.test(f.type)) hd.appendChild(bOuvrir);
      hd.appendChild(bF);
      vis.appendChild(hd);
      if (/^image\//.test(f.type)) { const im = document.createElement('img'); im.src = u; im.onclick = () => vis.classList.add('cache'); vis.appendChild(im); }
      else if (/pdf/.test(f.type)) { const fr = document.createElement('iframe'); fr.src = u; vis.appendChild(fr); }
      else { const p = document.createElement('p'); p.style.cssText = 'padding:24px;color:#8d8d95;text-align:center'; p.textContent = f.nom + ' · ' + taille(f.taille || f.blob.size) + ' — touche « Ouvrir à part »'; vis.appendChild(p); }
      vis.classList.remove('cache');
    }

    /* ---------- sauvegarde de la note ---------- */
    function serialiser() {
      const c = corps.cloneNode(true);
      c.querySelectorAll('img[data-f],video[data-f]').forEach((e) => e.removeAttribute('src'));
      c.querySelectorAll('[data-repere]').forEach((e) => e.remove());
      let h = c.innerHTML;
      if (h === '<br>' || h === '<div><br></div>') h = '';
      return h;
    }
    function synchroniser() {
      if (!n || mode !== 'ecrire') return;
      clearTimeout(minuteur);
      minuteur = setTimeout(sauverMaintenant, 500);
    }
    function sauverMaintenant() {
      clearTimeout(minuteur);
      if (!n || mode !== 'ecrire') return;
      const h = serialiser();
      if (h !== base) {
        base = h; n.html = h; n.texte = (corps.innerText || '').replace(/​/g, '').trim();
        n.modifie = Date.now();
        ctx.sauverNoeud(n);
      }
    }

    /* ---------- sélection / insertion ---------- */
    function memoriserSel() { const s = getSelection(); if (s.rangeCount && corps.contains(s.anchorNode)) selSauvee = s.getRangeAt(0).cloneRange(); }
    let derniereSel = null;                // dernier endroit où se trouvait le curseur dans la note
    document.addEventListener('selectionchange', () => { if (!ouvert || mode !== 'ecrire') return; const s = getSelection(); if (s.rangeCount && corps.contains(s.anchorNode)) derniereSel = s.getRangeAt(0).cloneRange(); });
    function restaurerSel() {
      corps.focus();
      const r = selSauvee || derniereSel; selSauvee = null;
      if (r && corps.contains(r.startContainer) && corps.contains(r.endContainer)) { try { const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* tant pis */ } }
    }
    function retirerRepere() { corps.querySelectorAll('[data-repere]').forEach((x) => x.remove()); }
    function poserRepere() {               // on plante un petit repère invisible à l'endroit du curseur : l'insertion se fera exactement là, même après une fenêtre ou un sélecteur de fichier
      retirerRepere();
      const sel = getSelection(); let r = null;
      if (sel.rangeCount && corps.contains(sel.anchorNode)) r = sel.getRangeAt(0).cloneRange();
      else if (derniereSel && corps.contains(derniereSel.startContainer)) r = derniereSel.cloneRange();
      if (!r) { r = document.createRange(); r.selectNodeContents(corps); r.collapse(false); }
      if (!r.collapsed) { selSauvee = r; return; }      // du texte est sélectionné : on garde la sélection
      const m = document.createElement('span'); m.setAttribute('data-repere', '1');
      r.insertNode(m);
    }
    function cmd(c, v) { if (mode !== 'ecrire') return; if (document.activeElement !== corps) restaurerSel(); document.execCommand(c, false, v); synchroniser(); }
    function inserer(html) {
      const m = corps.querySelector('[data-repere]');
      if (m) {
        corps.focus();
        const r = document.createRange(); r.setStartBefore(m); r.collapse(true);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); m.remove();
      } else if (document.activeElement !== corps) restaurerSel();
      if (!document.execCommand('insertHTML', false, html)) corps.insertAdjacentHTML('beforeend', html);
    }
    const EST_BLOC = /^(DIV|P|LI|H[1-6]|BLOCKQUOTE)$/;
    function blocCourant() {                 // la ligne (bloc) où se trouve le curseur
      const sel = getSelection(); if (!sel.rangeCount) return null;
      let x = sel.anchorNode;
      if (!x || !corps.contains(x)) return null;
      if (x.nodeType === 3) x = x.parentNode;
      while (x && x !== corps && !EST_BLOC.test(x.tagName)) x = x.parentNode;
      return x && x !== corps ? x : null;
    }
    function placerFin(el) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

    function basculerCoche() {               // ajoute (ou retire) une case à cocher au début de la ligne du curseur
      if (mode !== 'ecrire') return;
      if (document.activeElement !== corps) restaurerSel();
      let b = blocCourant();
      if (!b) { document.execCommand('formatBlock', false, '<div>'); b = blocCourant(); }
      if (!b) { corps.innerHTML = '<div><br></div>'; b = corps.firstChild; placerFin(b); }
      const c = b.querySelector(':scope > .coche');
      if (c) { const nx = c.nextSibling; c.remove(); if (nx && nx.nodeType === 3) nx.nodeValue = nx.nodeValue.replace(ZW, ''); }
      else {
        const vide = b.textContent.replace(/\u200b/g, '').trim() === '';
        const sp = document.createElement('span'); sp.className = 'coche'; sp.contentEditable = 'false'; sp.setAttribute('data-on', '0');
        b.insertBefore(sp, b.firstChild); sp.after(document.createTextNode(ZW));
        if (vide) { b.querySelectorAll(':scope > br').forEach((x) => x.remove()); placerFin(b); }
      }
      synchroniser();
    }
    function insererYoutube(url) {
      const id = idYoutube(url);
      if (!id) return false;
      const lien = 'https://youtu.be/' + id;
      inserer('<div class="yt" contenteditable="false" data-yt="' + id + '"><a href="' + lien + '" target="_blank" rel="noopener"><img src="https://img.youtube.com/vi/' + id + '/mqdefault.jpg" alt="" onerror="this.style.display=\'none\'"><span>Vidéo YouTube — ' + id + '</span></a></div><div><br></div>');
      synchroniser();
      return true;
    }

    /* ---------- liens entre pages : [[ ouvre la liste des sommets ---------- */
    const wikiBox = $('ed-wiki');
    const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const nomDe = (x) => x.titre || 'Sans titre';
    const wikiHtml = (c) => '<a class="wiki" data-n="' + esc(c.id) + '" contenteditable="false">' + esc(nomDe(c)) + '</a>';
    function fermerWiki() { wikiBox.classList.add('cache'); wikiBox.innerHTML = ''; }
    function resoudreWiki(rac) {                 // remet le titre à jour (si la page a été renommée) ou marque la page supprimée
      rac.querySelectorAll('a.wiki').forEach((a) => {
        const c = ctx.parId.get(a.getAttribute('data-n'));
        if (c) { a.textContent = nomDe(c); a.classList.remove('mort'); } else a.classList.add('mort');
      });
    }
    function avantCurseur() {
      const s = getSelection();
      if (!s.rangeCount || !s.isCollapsed) return null;
      const nd = s.anchorNode;
      if (!nd || nd.nodeType !== 3 || !corps.contains(nd)) return null;
      return { nd, off: s.anchorOffset, txt: nd.nodeValue.slice(0, s.anchorOffset) };
    }
    function poserWiki(t, m, cible, q) {
      let c = cible;
      if (!c) { c = ctx.creerNoeud(q, n); ctx.toast('Page « ' + q.slice(0, 24) + ' » créée et reliée'); }
      const r = document.createRange(); r.setStart(t.nd, t.off - m[0].length); r.setEnd(t.nd, t.off);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand('insertHTML', false, wikiHtml(c) + '&nbsp;');
      fermerWiki(); synchroniser();
    }
    function verifierWiki() {
      if (mode !== 'ecrire') return fermerWiki();
      const t = avantCurseur(); if (!t) return fermerWiki();
      let m = /\[\[([^\[\]]+)\]\]$/.exec(t.txt);
      if (m && m[1].trim()) {                                            // [[Titre]] tapé en entier
        const q = m[1].trim(), c = ctx.etat.noeuds.find((x) => x !== n && norm(nomDe(x)) === norm(q)) || null;
        poserWiki(t, m, c, q); return;
      }
      m = /\[\[([^\[\]]*)$/.exec(t.txt);
      if (!m) return fermerWiki();
      const q = m[1], nq = norm(q);
      let liste = ctx.etat.noeuds.filter((x) => x !== n && (!nq || norm(nomDe(x)).includes(nq)));
      liste.sort((a, b) => (norm(nomDe(b)).startsWith(nq) ? 1 : 0) - (norm(nomDe(a)).startsWith(nq) ? 1 : 0) || nomDe(a).localeCompare(nomDe(b), 'fr'));
      liste = liste.slice(0, 20);
      wikiBox.innerHTML = '';
      liste.forEach((c) => {
        const b = document.createElement('button'); b.className = 'w-ligne'; b.innerHTML = '<i style="background:' + esc(c.couleur || '#fff') + '"></i>' + esc(nomDe(c));
        b.addEventListener('click', () => poserWiki(t, m, c, q)); wikiBox.appendChild(b);
      });
      if (q.trim() && !ctx.etat.noeuds.some((x) => norm(nomDe(x)) === nq)) {
        const b = document.createElement('button'); b.className = 'w-ligne nouveau'; b.textContent = '+ Créer la page « ' + q.trim() + ' »';
        b.addEventListener('click', () => poserWiki(t, m, null, q.trim())); wikiBox.appendChild(b);
      }
      if (!wikiBox.children.length) { const p = document.createElement('div'); p.className = 'w-vide'; p.textContent = 'Écris le nom d’une page…'; wikiBox.appendChild(p); }
      wikiBox.classList.remove('cache');
    }
    wikiBox.addEventListener('pointerdown', (e) => e.preventDefault());
    const pileNav = [];                                        // pages d'où l'on vient : « retour » y revient
    function allerWiki(id) {
      const c = ctx.parId.get(id);
      if (!c) { ctx.toast('Cette page a été supprimée'); return; }
      sauverMaintenant(); fermerWiki();
      pileNav.push(n.id);
      ouvrir(c, { mode: c.html ? 'lire' : 'ecrire' });
    }

    /* ---------- barre d'outils ---------- */
    function popPalette(genre) {
      const pal = ctx.palette();
      pop.innerHTML = '';
      const ligne = document.createElement('div'); ligne.className = 'ligne';
      pal.forEach((p) => {
        const b = document.createElement('button'); b.className = 'coul';
        b.innerHTML = '<i style="background:' + esc(p.c) + '"></i>' + esc(p.nom || '');
        b.addEventListener('click', () => { appliquerCouleur(genre, p.c); fermerPop(); });
        ligne.appendChild(b);
      });
      const r = document.createElement('button'); r.className = 'coul'; r.innerHTML = '<i style="background:#000;border:1px solid #444"></i>Retirer';
      r.addEventListener('click', () => { appliquerCouleur(genre, null); fermerPop(); });
      ligne.appendChild(r);
      const l = document.createElement('button'); l.className = 'lien'; l.textContent = 'Modifier mon code couleur…';
      l.addEventListener('click', async () => { memoriserSel(); fermerPop(); await ctx.editerPalette(); restaurerSel(); });
      pop.appendChild(ligne); pop.appendChild(l);
    }
    const rgba = (hex, a) => { const m = hex.replace('#', ''); const v = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16); return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')'; };
    function appliquerCouleur(genre, c) {
      if (genre === 'texte') cmd('foreColor', c || '#f4f4f7');
      else cmd('hiliteColor', c ? rgba(c, 0.42) : 'transparent');
    }
    let popOuvert = null;
    function basculerPop(genre) {
      if (popOuvert === genre) return fermerPop();
      memoriserSel(); popPalette(genre); pop.classList.remove('cache'); popOuvert = genre;
    }
    function fermerPop() { pop.classList.add('cache'); popOuvert = null; }

    function changerTaille(d) {
      if (document.activeElement !== corps) restaurerSel();
      let cur = 3; try { cur = parseInt(document.queryCommandValue('fontSize'), 10) || 3; } catch (e) { /* 3 */ }
      cmd('fontSize', String(Math.max(1, Math.min(7, cur + d))));
    }
    async function boutonLien() {
      if (document.activeElement !== corps) restaurerSel();
      poserRepere();
      const texteSel = selSauvee ? selSauvee.toString() : '';
      const r = await ctx.modale.lienColle('Ajouter un lien');
      if (!r) { retirerRepere(); restaurerSel(); return; }
      if (selSauvee) restaurerSel();
      let url = r.trim();
      if (!url) return;
      if (idYoutube(url)) { insererYoutube(url); return; }
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
      if (texteSel) cmd('createLink', url);
      else inserer('<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url.replace(/^https?:\/\//, '')) + '</a>&nbsp;');
      synchroniser();
    }
    function boutonFormule() {
      if (document.activeElement !== corps) restaurerSel();
      document.execCommand('insertText', false, '$$$$');
      const s = getSelection();
      try { s.modify('move', 'backward', 'character'); s.modify('move', 'backward', 'character'); } catch (e) { /* tant pis */ }
      synchroniser();
    }
    const OUTILS = [
      { h: 'Titre', t: 1, f: () => cmd('formatBlock', '<h1>') },
      { h: 'Sous-titre', t: 1, f: () => cmd('formatBlock', '<h2>') },
      { h: 'Texte', t: 1, f: () => cmd('formatBlock', '<div>') },
      { sep: 1 },
      { h: '<b>G</b>', f: () => cmd('bold'), l: 'Gras' },
      { h: '<i style="font-family:Georgia,serif">I</i>', f: () => cmd('italic'), l: 'Italique' },
      { h: '<u>S</u>', f: () => cmd('underline'), l: 'Souligné' },
      { h: '<s>B</s>', f: () => cmd('strikeThrough'), l: 'Barré' },
      { sep: 1 },
      { h: 'A<small>−</small>', f: () => changerTaille(-1), l: 'Plus petit' },
      { h: 'A<small>+</small>', f: () => changerTaille(1), l: 'Plus grand' },
      { h: '<span class="a-couleur">A</span>', f: () => basculerPop('texte'), l: 'Couleur du texte' },
      { h: '<span class="a-surl">A</span>', f: () => basculerPop('surligne'), l: 'Surligner' },
      { sep: 1 },
      { h: '•', f: () => cmd('insertUnorderedList'), l: 'Liste' },
      { h: '1.', f: () => cmd('insertOrderedList'), l: 'Liste numérotée' },
      { h: '☐', f: basculerCoche, l: 'Case à cocher' },
      { h: '❝', f: () => cmd('formatBlock', '<blockquote>'), l: 'Citation' },
      { sep: 1 },
      { h: '🔗', f: boutonLien, l: 'Lien' },
      { h: '📎', f: () => { if (document.activeElement !== corps) restaurerSel(); poserRepere(); fpj.value = ''; fpj.click(); }, l: 'Photo, vidéo, PDF…' },
      { h: '∑', f: boutonFormule, l: 'Formule $$…$$' },
      { sep: 1 },
      { h: '↶', f: () => cmd('undo'), l: 'Annuler' },
      { h: '↷', f: () => cmd('redo'), l: 'Rétablir' },
      { h: '⌄', f: () => { corps.blur(); }, l: 'Fermer le clavier' },
    ];
    OUTILS.forEach((o) => {
      if (o.sep) { const s = document.createElement('span'); s.className = 'o sep'; outils.appendChild(s); return; }
      const b = document.createElement('button');
      b.className = 'o' + (o.t ? ' t' : '');
      b.innerHTML = o.h; if (o.l) b.setAttribute('aria-label', o.l);
      b.addEventListener('click', (e) => { e.preventDefault(); if (!o.h.includes('a-couleur') && !o.h.includes('a-surl')) fermerPop(); o.f(); });
      outils.appendChild(b);
    });
    ['mousedown', 'pointerdown'].forEach((ev) => barre.addEventListener(ev, (e) => { e.preventDefault(); }));
    fpj.addEventListener('change', () => { const l = [...fpj.files]; fpj.value = ''; if (l.length) ajouterFichiers(l); });

    /* ---------- mode lecture / écriture ---------- */
    function icones() {
      $('ed-mode').innerHTML = mode === 'lire' ? ctx.icones.crayon : ctx.icones.oeil;
      $('ed-mode').setAttribute('aria-label', mode === 'lire' ? 'Modifier' : 'Lire');
    }
    function versLecture() {
      if (mode === 'lire') return;
      sauverMaintenant(); fermerPop();
      mode = 'lire';
      corps.contentEditable = 'false'; corps.classList.add('lecture'); barre.classList.add('cache'); ed.classList.remove('clavier'); fermerWiki();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      corps.innerHTML = n.html || '';
      if (!n.html) corps.innerHTML = '';
      resoudreWiki(corps); rendreMaths(corps); hydrater(corps); icones();
    }
    function versEcriture(focus) {
      mode = 'ecrire';
      corps.contentEditable = 'true'; corps.classList.remove('lecture'); barre.classList.remove('cache');
      corps.innerHTML = n.html || ''; resoudreWiki(corps); hydrater(corps); base = serialiser(); icones();
      if (focus) { corps.focus(); placerFin(corps); }
    }

    /* ---------- étiquettes (tags) ---------- */
    function dessinerTags() {
      tagsBox.innerHTML = '';
      n.tags.forEach((t) => {
        const c = document.createElement('span'); c.className = 'tag-chip';
        c.innerHTML = '#' + esc(t) + '<button aria-label="Retirer">×</button>';
        c.querySelector('button').addEventListener('click', () => { n.tags = n.tags.filter((x) => x !== t); n.modifie = Date.now(); ctx.sauverNoeud(n); dessinerTags(); });
        tagsBox.appendChild(c);
      });
      const inp = document.createElement('input'); inp.id = 'ed-tag-in'; inp.placeholder = '+ tag'; inp.setAttribute('list', 'ed-tag-liste'); inp.autocapitalize = 'off'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.enterKeyHint = 'done';
      const dl = document.createElement('datalist'); dl.id = 'ed-tag-liste';
      ctx.tousLesTags().forEach((t) => { const o = document.createElement('option'); o.value = t; dl.appendChild(o); });
      const ajout = () => {
        const t = inp.value.trim().replace(/^#+/, '').toLowerCase();
        inp.value = '';
        if (t && !n.tags.includes(t)) { n.tags.push(t); n.modifie = Date.now(); ctx.sauverNoeud(n); dessinerTags(); const nouv = $('ed-tag-in'); if (nouv) nouv.focus(); }
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); ajout(); } });
      inp.addEventListener('change', ajout);
      inp.addEventListener('blur', () => { if (inp.value.trim()) ajout(); });
      tagsBox.appendChild(inp); tagsBox.appendChild(dl);
    }

    /* ---------- événements du texte ---------- */
    corps.addEventListener('input', () => {
      const h = corps.innerHTML;
      if (h === '<br>' || h === '<div><br></div>') corps.innerHTML = '';
      synchroniser();
      verifierWiki();
    });
    corps.addEventListener('focus', () => setTimeout(majClavier, 50));
    corps.addEventListener('blur', () => { setTimeout(majClavier, 0); sauverMaintenant(); setTimeout(() => { if (document.activeElement !== corps) fermerWiki(); }, 150); });
    corps.addEventListener('beforeinput', (e) => {            // Entrée dans une liste de cases : on continue la liste
      if (mode !== 'ecrire' || e.inputType !== 'insertParagraph') return;
      const b = blocCourant();
      if (!b || !b.querySelector(':scope > .coche')) return;
      e.preventDefault();
      const vide = b.textContent.replace(/​/g, '').trim() === '';
      if (vide) { b.innerHTML = '<br>'; placerFin(b); }
      else { const d = document.createElement('div'); d.innerHTML = '<span class="coche" contenteditable="false" data-on="0"></span>' + ZW; b.after(d); placerFin(d); }
      synchroniser();
    });
    corps.addEventListener('paste', (e) => {
      if (mode !== 'ecrire' || !e.clipboardData) return;
      const fichiers = [...(e.clipboardData.files || [])];
      if (fichiers.length) { e.preventDefault(); ajouterFichiers(fichiers); return; }
      const t = e.clipboardData.getData('text/plain');
      if (t) { e.preventDefault(); const tt = t.trim(); if (/^\S+$/.test(tt) && idYoutube(tt)) insererYoutube(tt); else document.execCommand('insertText', false, t); synchroniser(); }
    });
    corps.addEventListener('click', (e) => {
      const cible = e.target;
      const coche = cible.closest && cible.closest('.coche');
      if (coche) {
        e.preventDefault();
        const on = coche.getAttribute('data-on') === '1' ? '0' : '1';
        if (mode === 'lire') {                                  // en lecture, on modifie la note enregistrée (la vue contient des formules rendues)
          const i = [...corps.querySelectorAll('.coche')].indexOf(coche);
          const tmp = document.createElement('div'); tmp.innerHTML = n.html;
          const c2 = tmp.querySelectorAll('.coche')[i];
          if (c2) { c2.setAttribute('data-on', on); n.html = tmp.innerHTML; n.modifie = Date.now(); ctx.sauverNoeud(n); }
          coche.setAttribute('data-on', on);
        } else { coche.setAttribute('data-on', on); synchroniser(); }
        return;
      }
      const wk = cible.closest && cible.closest('a.wiki');
      if (wk) { e.preventDefault(); allerWiki(wk.getAttribute('data-n')); return; }
      const fich = cible.closest && cible.closest('a.fichier');
      if (fich) { e.preventDefault(); ouvrirFichier(fich.getAttribute('data-f')); return; }
      const img = cible.closest && cible.closest('img[data-f]');
      if (img && mode === 'lire') { e.preventDefault(); ouvrirFichier(img.getAttribute('data-f')); return; }
      const a = cible.closest && cible.closest('a[href]');
      if (a && (mode === 'lire' || a.closest('.yt'))) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
    });

    /* ---------- ouverture / fermeture ---------- */
    function majClavier() {                 // clavier ouvert pendant qu'on écrit la note : on libère de la place (jamais si le curseur est dans un autre champ, sinon il disparaîtrait)
      const vv = racine.visualViewport;
      const ouvertClavier = !!vv && racine.innerHeight - vv.height > 140;
      ed.classList.toggle('clavier', ouvertClavier && mode === 'ecrire' && ouvert && document.activeElement === corps);
    }
    function ajuster() {
      const vv = racine.visualViewport;
      if (!vv || !ouvert) return;
      ed.style.height = vv.height + 'px'; ed.style.top = vv.offsetTop + 'px';
      majClavier();
      if (racine.scrollY) racine.scrollTo(0, 0);
    }
    if (racine.visualViewport) { racine.visualViewport.addEventListener('resize', ajuster); racine.visualViewport.addEventListener('scroll', ajuster); }

    $('ed-retour').addEventListener('click', () => {
      while (pileNav.length) {
        const prec = ctx.parId.get(pileNav.pop());
        if (prec) { sauverMaintenant(); fermerWiki(); ouvrir(prec, { mode: prec.html ? 'lire' : 'ecrire' }); return; }
      }
      fermer();
    });
    $('ed-mode').addEventListener('click', () => { if (mode === 'lire') versEcriture(true); else versLecture(); });
    $('ed-plus').addEventListener('click', () => {
      if (!menu.classList.contains('cache')) { menu.classList.add('cache'); return; }
      sauverMaintenant();
      menu.innerHTML = '';
      ctx.menuNoeud(n, menu, () => { menu.classList.add('cache'); });
      menu.classList.remove('cache');
    });
    ed.addEventListener('pointerdown', (e) => { if (!menu.classList.contains('cache') && !menu.contains(e.target) && e.target.closest('#ed-plus') == null) menu.classList.add('cache'); if (popOuvert && !pop.contains(e.target) && !barre.contains(e.target)) fermerPop(); });
    titre.addEventListener('input', () => { if (!n) return; n.titre = titre.value; n.modifie = Date.now(); ctx.sauverNoeud(n); ctx.titreChange && ctx.titreChange(n); });
    titre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titre.blur(); if (mode === 'ecrire') { corps.focus(); placerFin(corps); } } });

    function ouvrir(noeud, options) {
      n = noeud; ouvert = true;
      titre.value = n.titre && n.titre !== 'Sans titre' ? n.titre : (n.titre || '');
      menu.classList.add('cache'); fermerPop(); vis.classList.add('cache');
      $('ed-retour').innerHTML = ctx.icones.retour; $('ed-plus').innerHTML = ctx.icones.plus3;
      dessinerTags();
      ed.classList.remove('cache');
      ajuster();
      const modeVoulu = (options && options.mode) || (n.html ? 'lire' : 'ecrire');
      if (modeVoulu === 'lire') {
        mode = 'lire';
        corps.contentEditable = 'false'; corps.classList.add('lecture'); barre.classList.add('cache');
        corps.innerHTML = n.html || ''; resoudreWiki(corps); rendreMaths(corps); hydrater(corps);
      } else { versEcriture(false); if (!titre.value) titre.focus(); else corps.focus(); }
      icones();
    }
    function fermer() {
      if (!ouvert) return;
      sauverMaintenant();
      const noeud = n;
      ouvert = false; n = null; pileNav.length = 0; fermerWiki(); ed.classList.remove('clavier');
      ed.classList.add('cache'); ed.style.height = ''; ed.style.top = '';
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
      corps.innerHTML = '';
      ctx.ferme && ctx.ferme(noeud);
    }
    return { ouvrir, fermer, get noeud() { return n; }, get ouvert() { return ouvert; }, get mode() { return mode; }, rendreMaths, ajouterFichiers, sauverMaintenant };
  }

  racine.CerveauEditeur = { creer, rendreMaths, idYoutube, taille, esc, nouvelId };
})(typeof self !== 'undefined' ? self : this);
