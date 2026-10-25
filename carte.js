/* carte.js — la carte 3D : moteur de rendu maison (canvas 2D, perspective), disposition « aimants », gestes tactiles. */
(function (racine) {
  'use strict';

  /* ---------- petits outils de calcul 3D ---------- */
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const borne = (x, a, b) => Math.max(a, Math.min(b, x));

  /* ---------- polyèdres ---------- */
  function icosaedre() {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return { v, f };
  }
  function octaedre() {
    const v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const f = [];
    for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) f.push([x, y, z]);
    return { v, f };
  }
  function tetraedre() {
    return { v: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(norm), f: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]] };
  }
  // dual : chaque face devient un sommet, chaque sommet devient une face (cube = dual de l'octaèdre, dodécaèdre = dual de l'icosaèdre)
  function dual(p) {
    const v = p.f.map((f) => norm([0, 1, 2].map((k) => (p.v[f[0]][k] + p.v[f[1]][k] + p.v[f[2]][k]) / 3)));
    const f = p.v.map((s, i) => {
      const adj = []; p.f.forEach((fa, j) => { if (fa.includes(i)) adj.push(j); });
      const n = norm(s);
      const a = norm(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
      const b = cross(n, a);
      adj.sort((j, k) => Math.atan2(dot(v[j], b), dot(v[j], a)) - Math.atan2(dot(v[k], b), dot(v[k], a)));
      return adj;
    });
    return { v, f };
  }
  function prismePentagonal() {
    const v = [], R = 0.95, h = 0.55, e = 1 / Math.hypot(R, h);
    for (const y of [h, -h]) for (let k = 0; k < 5; k++) { const a = (2 * Math.PI * k) / 5 - Math.PI / 2; v.push([R * Math.cos(a) * e, y * e, R * Math.sin(a) * e]); }
    const f = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]];
    for (let k = 0; k < 5; k++) f.push([k, (k + 1) % 5, 5 + ((k + 1) % 5), 5 + k]);
    return { v, f };
  }
  const FORMES = {};
  function preparer(nom, p) {
    p.f.forEach((f) => { const c = [0, 0, 0]; f.forEach((i) => { c[0] += p.v[i][0]; c[1] += p.v[i][1]; c[2] += p.v[i][2]; }); f.n = norm(c); f.c = c.map((x) => x / f.length); });
    FORMES[nom] = p;
  }
  const ico = icosaedre(), octa = octaedre();
  preparer('icosa', ico); preparer('octa', octa); preparer('tetra', tetraedre());
  preparer('cube', dual(octa)); preparer('dodeca', dual(ico)); preparer('penta', prismePentagonal());
  FORMES.sphere = null;   // dessinée comme une boule dégradée

  const LISTE_FORMES = [
    ['sphere', 'Sphère', '●'], ['cube', 'Cube', '■'], ['tetra', 'Tétraèdre', '▲'], ['octa', 'Octaèdre', '◆'],
    ['penta', 'Pentagone', '⬟'], ['dodeca', 'Dodécaèdre', '⬢'], ['icosa', 'Icosaèdre', '✦'],
  ];

  function hexRgb(h) {
    h = (h || '#e8e8ee').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* ---------- la carte ---------- */
  function creer(cv, etat, cb) {
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const cam = { cible: [0, 0, 0], yaw: 0.6, pitch: 0.28, dist: 16 };
    let anim = null;              // glissement de la caméra vers un sommet
    let selection = null;         // id du sommet choisi
    let filtre = null;            // Set d'id : sommets qui correspondent à la recherche
    let mode = null;              // 'relier' : on attend le sommet à relier
    let alpha = 0;                // énergie de la disposition (0 = immobile)
    let sale = true;              // il faut redessiner
    let auto = true;              // la caméra suit tant que le graphe s'organise (jusqu'au premier geste)
    let actif = false;            // l'onglet Carte est visible
    let temps = 0;
    const etoiles = Array.from({ length: 160 }, () => norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]).concat([Math.random()]));
    const parId = new Map();

    const RE_JOUR = /^\d{4}-\d{2}-\d{2}$/;
    const orbitesOn = () => etat.meta.orbites !== false;
    const joursVisibles = () => etat.meta.jours !== false;
    const cache = (n) => n._j && !joursVisibles();            // jour du journal masqué sur la carte
    let S = { parent: new Map(), enfants: new Map(), ordre: [], racines: [], jours: [], mois: [], Rj: 0 };
    let phase = 0;
    function reindexer() { parId.clear(); etat.noeuds.forEach((n) => { parId.set(n.id, n); n._j = !!(n.jour && RE_JOUR.test(n.jour)); }); degres(); structure(); sale = true; }
    function degres() {
      etat.noeuds.forEach((n) => { n._deg = 0; });
      etat.liens.forEach((l) => { const a = parId.get(l.a), b = parId.get(l.b); if (a) a._deg++; if (b) b._deg++; });
    }

    /* --- structure : parents, enfants (orbites), jours --- */
    function rayonAnneau(k, mx, rp) {
      const r = k === 1 ? mx + 3 : Math.max(mx + 2.6, (mx + 0.8) / Math.sin(Math.PI / k));
      return Math.min(70, Math.max(r, rp + mx + 1.6));
    }
    function structure() {
      const ns = etat.noeuds, par = new Map(), enf = new Map();
      ns.forEach((n) => enf.set(n.id, []));
      for (const l of etat.liens) {
        if (l.t === 'ref') continue;                                     // simple lien d'association : ne crée pas d'orbite
        const a = parId.get(l.a), b = parId.get(l.b);
        if (!a || !b || a === b || a._j || b._j || par.has(b.id)) continue;
        let x = a, cyc = false, g = 0;
        while (x && g++ < 5000) { if (x === b) { cyc = true; break; } const pid = par.get(x.id); x = pid ? parId.get(pid) : null; }
        if (cyc) continue;
        par.set(b.id, a.id); enf.get(a.id).push(b);
      }
      const tri = (p, q) => ((p.cree || 0) - (q.cree || 0)) || (p.id < q.id ? -1 : 1);
      enf.forEach((arr) => arr.sort(tri));
      const racines = ns.filter((n) => !par.has(n.id) && !n._j).sort(tri);
      const ordre = racines.slice();
      for (let i = 0; i < ordre.length; i++) enf.get(ordre[i].id).forEach((c) => ordre.push(c));
      for (let i = ordre.length - 1; i >= 0; i--) {
        const p = ordre[i], ch = enf.get(p.id);
        if (!ch.length) { p._env = rayon(p) + 0.7; continue; }
        let mx = 0; ch.forEach((c) => { mx = Math.max(mx, c._env || 1); });
        p._env = rayonAnneau(ch.length, mx, rayon(p)) * 1.3 + mx;
      }
      const jours = ns.filter((n) => n._j);
      const mois = [...new Set(jours.map((n) => n.jour.slice(0, 7)))].sort();
      S = { parent: par, enfants: enf, ordre, racines, jours, mois, Rj: S.Rj || 0 };
    }

    function redim() {
      const r = cv.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(2, racine.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      sale = true;
    }

    /* --- caméra --- */
    let base = null;
    function calcCam() {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const pos = [cam.cible[0] + cam.dist * Math.sin(cam.yaw) * cp, cam.cible[1] + cam.dist * sp, cam.cible[2] + cam.dist * Math.cos(cam.yaw) * cp];
      const f = norm([cam.cible[0] - pos[0], cam.cible[1] - pos[1], cam.cible[2] - pos[2]]);
      const r = norm(cross(f, [0, 1, 0]));
      const u = cross(r, f);
      base = { pos, f, r, u, foc: Math.min(W, H) * 1.05 + H * 0.15 };
    }
    function projeter(n) {
      if (cache(n)) { n._vis = false; return; }
      const d = [n.x - base.pos[0], n.y - base.pos[1], n.z - base.pos[2]];
      const Z = dot(d, base.f);
      n._z = Z;
      if (Z < 0.4) { n._vis = false; return; }
      n._vis = true;
      n._sx = W / 2 + (base.foc * dot(d, base.r)) / Z;
      n._sy = H / 2 - (base.foc * dot(d, base.u)) / Z;
      n._pr = (base.foc * rayon(n)) / Z;
    }
    const FACT_TAILLE = [0, 0.62, 1, 1.6, 2.7, 0.36];       // 1 petit · 2 moyen · 3 grand · 4 très grand · 5 très petit
    const rayon = (n) => (0.8 + 0.17 * Math.min(n._deg || 0, 10)) * FACT_TAILLE[n.taille || 2];

    function glisser(n, distance) {
      const d1 = distance || Math.max(7, Math.min(cam.dist, 11));
      const u = base ? base.u : [0, 1, 0], k = d1 * 0.17;      // on vise un peu sous le sommet : il apparaît dans la moitié haute, au-dessus de la carte d'actions
      auto = false;
      anim = { de: cam.cible.slice(), vers: [n.x - u[0] * k, n.y - u[1] * k, n.z - u[2] * k], d0: cam.dist, d1, t: 0 };
      sale = true;
    }
    function ajustement(sous) {                 // centre et distance qui montrent tout le graphe (ou seulement l'ensemble « sous »)
      const ns = etat.noeuds.filter((n) => !cache(n) && (!sous || sous.has(n.id)));
      if (!ns.length) return { c: [0, 0, 0], d: 14 };
      const c = [0, 0, 0]; ns.forEach((n) => { c[0] += n.x; c[1] += n.y; c[2] += n.z; });
      c[0] /= ns.length; c[1] /= ns.length; c[2] /= ns.length;
      let R = 0; ns.forEach((n) => { R = Math.max(R, Math.hypot(n.x - c[0], n.y - c[1], n.z - c[2])); });
      const large = Math.min(W, H) / Math.min(W, H);   // on cadre sur le plus petit côté de l'écran
      return { c, d: borne((R + 1.5) * (sous ? 3.8 : 2.8) * large + 2, 8, 4000) };
    }
    function cadrer(ids) {                  // la caméra vole vers un groupe de sommets
      const a = ajustement(ids); auto = false;
      anim = { de: cam.cible.slice(), vers: a.c, d0: cam.dist, d1: a.d, t: 0 };
      sale = true;
    }
    function recentrer() {
      const a = ajustement(); auto = true;
      anim = { de: cam.cible.slice(), vers: a.c, d0: cam.dist, d1: a.d, t: 0 };
      sale = true;
    }

    /* --- disposition « aimants » en 3D --- */
    function simulerLibre() {                    // ancienne disposition : tous les sommets s'écartent et se tirent par les liens
      const ns = etat.noeuds, N = ns.length;
      const rep = 9.0 * alpha, ressort = 0.07 * alpha, L = 5;
      for (const n of ns) { n._fx = 0; n._fy = 0; n._fz = 0; }
      for (let i = 0; i < N; i++) {
        const a = ns[i];
        for (let j = i + 1; j < N; j++) {
          const b = ns[j];
          let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dz = Math.random() - 0.5; d2 = 0.3; }
          if (d2 > 900) continue;
          const f = rep / d2, d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
          a._fx += fx; a._fy += fy; a._fz += fz; b._fx -= fx; b._fy -= fy; b._fz -= fz;
        }
      }
      for (const l of etat.liens) {
        const a = parId.get(l.a), b = parId.get(l.b);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 0.01;
        const f = (d - L) * ressort, fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
        a._fx += fx; a._fy += fy; a._fz += fz; b._fx -= fx; b._fy -= fy; b._fz -= fz;
      }
      integrer(ns);
    }
    function integrer(ns) {
      for (const n of ns) {
        n._fx -= n.x * 0.012 * alpha; n._fy -= n.y * 0.012 * alpha; n._fz -= n.z * 0.012 * alpha;
        if (n.fixe || n._tenu) { n._vx = n._vy = n._vz = 0; continue; }
        n._vx = ((n._vx || 0) + n._fx) * 0.82; n._vy = ((n._vy || 0) + n._fy) * 0.82; n._vz = ((n._vz || 0) + n._fz) * 0.82;
        const v = Math.hypot(n._vx, n._vy, n._vz), m = 0.6;
        if (v > m) { n._vx *= m / v; n._vy *= m / v; n._vz *= m / v; }
        n.x += n._vx; n.y += n._vy; n.z += n._vz;
      }
    }
    function simulerRacines() {                  // mode orbites : seules les « racines » (sommets sans parent) s'organisent entre elles
      const rs = S.racines, N = rs.length;
      for (const n of rs) { n._fx = 0; n._fy = 0; n._fz = 0; }
      for (let i = 0; i < N; i++) {
        const a = rs[i];
        for (let j = i + 1; j < N; j++) {
          const b = rs[j];
          let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dz = Math.random() - 0.5; d2 = 0.3; }
          const d = Math.sqrt(d2), sep = (a._env || 1) + (b._env || 1) + 2.5;
          let f = (9.0 * alpha * (1 + sep * 0.15)) / d2;
          if (d < sep) f += (sep - d) * 0.09 * alpha;
          if (d2 > 2500 && d >= sep) continue;
          const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
          a._fx += fx; a._fy += fy; a._fz += fz; b._fx -= fx; b._fy -= fy; b._fz -= fz;
        }
      }
      for (const l of etat.liens) {               // liens d'association entre racines : léger rapprochement
        const a = parId.get(l.a), b = parId.get(l.b);
        if (!a || !b || S.parent.has(a.id) || S.parent.has(b.id) || a._j || b._j) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 0.01;
        const L = (a._env || 1) + (b._env || 1) + 3;
        const f = (d - L) * 0.05 * alpha, fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
        a._fx += fx; a._fy += fy; a._fz += fz; b._fx -= fx; b._fy -= fy; b._fz -= fz;
      }
      integrer(rs);
    }
    const AXE_RACINE = norm([0.16, 1, 0.1]);
    function anneauDe(p, orb) {                  // repère du cercle des enfants de p : centre, axe, deux vecteurs, rayon
      let axe = AXE_RACINE, decal = 0;
      const gp = S.parent.has(p.id) ? parId.get(S.parent.get(p.id)) : null;
      if (gp) { axe = norm([p.x - gp.x, p.y - gp.y, p.z - gp.z]); }
      let mx = 0; orb.forEach((c) => { mx = Math.max(mx, c._env || 1); });
      const R = rayonAnneau(orb.length, mx, rayon(p));
      if (gp) decal = R * 0.3;
      const u = Math.abs(axe[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const e1 = norm(cross(axe, u)), e2 = cross(axe, e1);
      return { c: [p.x + axe[0] * decal, p.y + axe[1] * decal, p.z + axe[2] * decal], e1, e2, R };
    }
    const hach = (id) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 6283; return h / 1000; };
    function placerOrbites(dt) {                 // les enfants glissent vers leur place sur l'anneau de leur parent ; les jours vers leur mois
      let bouge = false;
      const tourne = etat.meta.animer !== false;
      if (tourne) phase += dt * 0.00005;
      const vers = (n, tx, ty, tz, k) => {
        const dx = tx - n.x, dy = ty - n.y, dz = tz - n.z, d = Math.hypot(dx, dy, dz);
        if (d < 0.004) return;
        if (d < 0.02) { n.x = tx; n.y = ty; n.z = tz; bouge = true; return; }
        n.x += dx * k; n.y += dy * k; n.z += dz * k; bouge = true;
      };
      for (const p of S.ordre) {
        const ch = S.enfants.get(p.id);
        if (!ch.length) { p._anneau = null; continue; }
        const orb = ch.filter((c) => !c.fixe && !c._tenu);
        if (!orb.length) { p._anneau = null; continue; }
        const an = anneauDe(p, orb); p._anneau = an;
        const ph = (p._ph = p._ph === undefined ? hach(p.id) : p._ph) + phase;
        orb.forEach((c, i) => {
          const th = (2 * Math.PI * i) / orb.length + ph, ct = Math.cos(th) * an.R, st = Math.sin(th) * an.R;
          vers(c, an.c[0] + an.e1[0] * ct + an.e2[0] * st, an.c[1] + an.e1[1] * ct + an.e2[1] * st, an.c[2] + an.e1[2] * ct + an.e2[2] * st, 0.14);
        });
      }
      // jours : un anneau par mois, rangés par date (le mois le plus récent à hauteur de la carte)
      if (S.jours.length) {
        let ext = 0; S.racines.forEach((r) => { ext = Math.max(ext, Math.hypot(r.x, r.z) + (r._env || 1)); });
        const Rj = Math.max(11, ext + 3.5);
        S.Rj = S.Rj ? S.Rj + (Rj - S.Rj) * 0.08 : Rj;
        const dernier = S.mois.length - 1;
        for (const n of S.jours) {
          if (n.fixe || n._tenu) continue;
          const mi = S.mois.indexOf(n.jour.slice(0, 7)), j = +n.jour.slice(8, 10);
          const th = -Math.PI / 2 + (2 * Math.PI * (j - 1)) / 31;
          vers(n, Math.cos(th) * S.Rj, (mi - dernier) * 4.4, Math.sin(th) * S.Rj, 0.1);
        }
      }
      return bouge;
    }
    let sauvePos = false;
    function simuler(dt) {
      if (!etat.noeuds.length) return;
      const orb = orbitesOn(), tourne = orb && etat.meta.animer !== false;
      if (alpha >= 0.004) {
        if (orb) simulerRacines(); else simulerLibre();
        alpha *= 0.985; sale = true; sauvePos = true;
      } else if (alpha > 0) alpha = 0;
      let b = false;
      if (orb) b = placerOrbites(dt || 33); else S.ordre.forEach((p) => { p._anneau = null; });
      if (b) { sale = true; if (!tourne) sauvePos = true; }
      if (sauvePos && alpha === 0 && (!b || tourne)) { sauvePos = false; cb.positionsStables && cb.positionsStables(); }
    }
    function reveiller(force) { alpha = Math.max(alpha, force || 1); }

    /* --- dessin --- */
    function dessiner(dt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g0 = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, Math.max(W, H) * 0.8);
      g0.addColorStop(0, '#0d0d16'); g0.addColorStop(1, '#000');
      ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
      calcCam();
      // étoiles (fond lointain)
      for (const s of etoiles) {
        const z = dot(s, base.f);
        if (z < 0.15) continue;
        const x = W / 2 + (base.foc * dot(s, base.r)) / z * 0.9, y = H / 2 - (base.foc * dot(s, base.u)) / z * 0.9;
        if (x < 0 || y < 0 || x > W || y > H) continue;
        const tw = 0.35 + 0.35 * Math.sin(temps * 0.0012 + s[3] * 40);
        ctx.fillStyle = 'rgba(200,210,255,' + (tw * 0.8).toFixed(2) + ')';
        ctx.fillRect(x, y, s[3] > 0.8 ? 2 : 1, s[3] > 0.8 ? 2 : 1);
      }
      const ns = etat.noeuds;
      for (const n of ns) projeter(n);
      const visibles = ns.filter((n) => n._vis);
      const sel = selection && parId.get(selection);
      const voisins = new Set();
      if (sel) etat.liens.forEach((l) => { if (l.a === sel.id) voisins.add(l.b); else if (l.b === sel.id) voisins.add(l.a); });
      const att = (n) => (filtre && !filtre.has(n.id) ? 0.2 : 1);

      // anneaux d'orbite (très discrets) : un par parent, un par mois de journal
      if (orbitesOn()) {
        ctx.lineWidth = 1; ctx.lineCap = 'round';
        const pp = (x, y, z) => { const d = [x - base.pos[0], y - base.pos[1], z - base.pos[2]], Z = dot(d, base.f); return Z < 0.4 ? null : [W / 2 + (base.foc * dot(d, base.r)) / Z, H / 2 - (base.foc * dot(d, base.u)) / Z]; };
        const cercle = (c, e1, e2, R, col) => {
          ctx.strokeStyle = col; ctx.beginPath();
          let go = false;
          for (let i = 0; i <= 56; i++) {
            const th = (i / 56) * 6.2832, ct = Math.cos(th) * R, st = Math.sin(th) * R;
            const q = pp(c[0] + e1[0] * ct + e2[0] * st, c[1] + e1[1] * ct + e2[1] * st, c[2] + e1[2] * ct + e2[2] * st);
            if (!q) { go = false; continue; }
            if (go) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
            go = true;
          }
          ctx.stroke();
        };
        for (const p of S.ordre) {
          const an = p._anneau;
          if (!an || cache(p) || !p._vis) continue;
          const fort = sel && (p.id === sel.id || (S.parent.get(sel.id) === p.id));
          cercle(an.c, an.e1, an.e2, an.R, fort ? 'rgba(170,190,255,0.34)' : 'rgba(140,160,230,0.12)');
        }
        if (joursVisibles() && S.jours.length && S.Rj) {
          const dernier = S.mois.length - 1;
          S.mois.forEach((m, mi) => cercle([0, (mi - dernier) * 4.4, 0], [1, 0, 0], [0, 0, 1], S.Rj, 'rgba(255,209,102,0.11)'));
        }
      }
      // arêtes
      ctx.lineCap = 'round';
      for (const l of etat.liens) {
        const a = parId.get(l.a), b = parId.get(l.b);
        if (!a || !b || !a._vis || !b._vis) continue;
        const prof = borne(1.25 - ((a._z + b._z) / 2) / (cam.dist * 3.2), 0.1, 1);
        const lie = sel && (l.a === sel.id || l.b === sel.id);
        ctx.strokeStyle = lie ? 'rgba(255,255,255,' + (0.85 * prof).toFixed(2) + ')' : 'rgba(52,54,68,' + (0.65 * prof * Math.min(att(a), att(b)) + 0.07).toFixed(2) + ')';
        ctx.lineWidth = lie ? 1.3 : 0.6;
        ctx.beginPath(); ctx.moveTo(a._sx, a._sy); ctx.lineTo(b._sx, b._sy); ctx.stroke();
      }
      // lueurs
      ctx.globalCompositeOperation = 'lighter';
      for (const n of visibles) {
        const r = Math.max(n._pr, 2) * 2.6, c = n._rgb || (n._rgb = hexRgb(n.couleur));
        const a = 0.32 * att(n) * borne(1.3 - n._z / (cam.dist * 3.5), 0.15, 1);
        const g = ctx.createRadialGradient(n._sx, n._sy, 0, n._sx, n._sy, r);
        g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n._sx, n._sy, r, 0, 6.2832); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // solides, du plus loin au plus proche
      visibles.sort((a, b) => b._z - a._z);
      const L = norm([base.u[0] * 0.65 - base.r[0] * 0.45 - base.f[0] * 0.75, base.u[1] * 0.65 - base.r[1] * 0.45 - base.f[1] * 0.75, base.u[2] * 0.65 - base.r[2] * 0.45 - base.f[2] * 0.75]);
      for (const n of visibles) {
        const c = n._rgb || (n._rgb = hexRgb(n.couleur));
        const al = att(n) * borne(1.35 - n._z / (cam.dist * 4), 0.35, 1);
        ctx.globalAlpha = al;
        const r = n._pr;
        const forme = FORMES[n.forme];
        if (n._j) {                                   // jour du journal : un anneau avec le numéro du jour
          const rr = Math.max(r, 3.2);
          ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.16)'; ctx.beginPath(); ctx.arc(n._sx, n._sy, rr, 0, 6.2832); ctx.fill();
          ctx.strokeStyle = 'rgb(' + Math.min(255, c[0] + 25) + ',' + Math.min(255, c[1] + 25) + ',' + Math.min(255, c[2] + 25) + ')'; ctx.lineWidth = Math.max(1.6, rr * 0.2);
          ctx.beginPath(); ctx.arc(n._sx, n._sy, rr, 0, 6.2832); ctx.stroke();
          if (rr >= 9) { ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(rr * 0.9) + 'px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(+n.jour.slice(8, 10)), n._sx, n._sy + 0.5); }
          else { ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; ctx.beginPath(); ctx.arc(n._sx, n._sy, rr * 0.3, 0, 6.2832); ctx.fill(); }
        } else if (r < 3.5 || !forme) {
          const g = ctx.createRadialGradient(n._sx - r * 0.35, n._sy - r * 0.4, r * 0.1, n._sx, n._sy, r);
          g.addColorStop(0, 'rgb(' + Math.min(255, c[0] + 90) + ',' + Math.min(255, c[1] + 90) + ',' + Math.min(255, c[2] + 90) + ')');
          g.addColorStop(1, 'rgb(' + (c[0] * 0.45 | 0) + ',' + (c[1] * 0.45 | 0) + ',' + (c[2] * 0.45 | 0) + ')');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n._sx, n._sy, Math.max(r, 1.6), 0, 6.2832); ctx.fill();
        } else {
          n._ay = (n._ay || 0) + dt * 0.00035 * (1 + ((n._h = n._h || (Math.random() + 0.5)) - 1) * 0.5); n._ax = (n._ax || 0.4) + dt * 0.0002;
          const cy = Math.cos(n._ay), sy = Math.sin(n._ay), cx = Math.cos(n._ax), sx = Math.sin(n._ax);
          const rot = (p) => { let x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy, y = p[1]; const y2 = y * cx - z * sx, z2 = y * sx + z * cx; return [x, y2, z2]; };
          const rr = rayon(n);
          const pv = forme.v.map((p) => { const q = rot(p); return [n.x + q[0] * rr, n.y + q[1] * rr, n.z + q[2] * rr]; });
          const faces = [];
          for (const f of forme.f) {
            const nm = rot(f.n);
            const cen = [0, 0, 0]; f.forEach((i) => { cen[0] += pv[i][0]; cen[1] += pv[i][1]; cen[2] += pv[i][2]; });
            cen[0] /= f.length; cen[1] /= f.length; cen[2] /= f.length;
            const vers = [cen[0] - base.pos[0], cen[1] - base.pos[1], cen[2] - base.pos[2]];
            if (dot(nm, vers) >= 0) continue;                    // face tournée de l'autre côté
            faces.push({ f, nm, z: dot(vers, base.f) });
          }
          faces.sort((a, b) => b.z - a.z);
          const proj = pv.map((p) => { const d = [p[0] - base.pos[0], p[1] - base.pos[1], p[2] - base.pos[2]], Z = Math.max(0.4, dot(d, base.f)); return [W / 2 + (base.foc * dot(d, base.r)) / Z, H / 2 - (base.foc * dot(d, base.u)) / Z]; });
          for (const fa of faces) {
            const lum = 0.28 + 0.72 * Math.max(0, dot(fa.nm, L));
            ctx.fillStyle = 'rgb(' + Math.min(255, (c[0] * lum + 18) | 0) + ',' + Math.min(255, (c[1] * lum + 18) | 0) + ',' + Math.min(255, (c[2] * lum + 18) | 0) + ')';
            ctx.beginPath();
            fa.f.forEach((i, k) => { if (k) ctx.lineTo(proj[i][0], proj[i][1]); else ctx.moveTo(proj[i][0], proj[i][1]); });
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.8; ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        // anneaux : sélection, voisins, résultats de recherche
        const pulse = 0.5 + 0.5 * Math.sin(temps * 0.004);
        if (sel && n.id === sel.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n._sx, n._sy, Math.max(r, 3) * 1.55 + 2, 0, 6.2832); ctx.stroke(); }
        else if (filtre && filtre.size <= 12 && filtre.has(n.id)) { ctx.strokeStyle = 'rgba(255,224,102,' + (0.5 + 0.5 * pulse).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n._sx, n._sy, Math.max(r, 3) * 1.5 + 2, 0, 6.2832); ctx.stroke(); }
        else if (mode === 'relier' && sel) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.35 * pulse).toFixed(2) + ')'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(n._sx, n._sy, Math.max(r, 3) * 1.5 + 2, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
      }
      // étiquettes « galaxie » : les plus gros d'abord ; chaque nom n'apparaît que s'il a la place (sans chevaucher un nom déjà posé)
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
      const cands = [];
      for (const n of visibles) {
        const forcee = !!(sel && (n.id === sel.id || voisins.has(n.id)));
        const dansFiltre = !!(filtre && filtre.has(n.id));
        if (filtre && !dansFiltre && !forcee) continue;
        if (!forcee && !dansFiltre && n._pr < 4) continue;
        if (n._sx < -40 || n._sx > W + 40 || n._sy < -20 || n._sy > H + 20) continue;
        cands.push({ n, forcee, dansFiltre, p: (forcee ? 1e6 : 0) + (dansFiltre ? 1e3 : 0) + n._pr });
      }
      cands.sort((a, b) => b.p - a.p);
      const pris = [];
      for (const { n, forcee, dansFiltre } of cands) {
        if (pris.length > 120) break;
        const importante = forcee || dansFiltre;
        const taille = borne(11 + n._pr * 0.12, 11, 15);
        const a = borne(1.5 - n._z / (cam.dist * 3), 0.35, 1);
        ctx.font = (importante ? '700 ' : '600 ') + taille.toFixed(0) + 'px -apple-system, system-ui, sans-serif';
        const t = (n._j ? (n.titre || n.jour).replace(/\s*20\d\d$/, '') : (n.titre || 'Sans titre')).slice(0, 26);
        const y = n._sy + Math.max(n._pr, 3) * 1.45 + 5;
        const w = ctx.measureText(t).width;
        const bx = [n._sx - w / 2 - 4, y - 2, n._sx + w / 2 + 4, y + taille + 4];
        if (!forcee && pris.some((q) => bx[0] < q[2] && bx[2] > q[0] && bx[1] < q[3] && bx[3] > q[1])) continue;
        pris.push(bx);
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,' + (0.85 * a).toFixed(2) + ')'; ctx.strokeText(t, n._sx, y);
        ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; ctx.fillText(t, n._sx, y);
      }
    }

    /* --- boucle --- */
    let derniereImage = 0, dernierAuto = 0;
    function boucle(t) {
      requestAnimationFrame(boucle);
      if (!actif) return;
      const fluide = etat.meta.animer !== false;
      const cadence = fluide ? 33 : 16;
      if (t - derniereImage < cadence) return;
      const dt = Math.min(100, t - (derniereImage || t)); derniereImage = t; temps = t;
      if (anim) {
        anim.t = Math.min(1, anim.t + dt / 650);
        const e = 1 - Math.pow(1 - anim.t, 3);
        for (let k = 0; k < 3; k++) cam.cible[k] = anim.de[k] + (anim.vers[k] - anim.de[k]) * e;
        cam.dist = anim.d0 + (anim.d1 - anim.d0) * e;
        if (anim.t >= 1) anim = null;
        sale = true;
      }
      simuler(dt);
      if (auto && !anim && etat.noeuds.length && (alpha > 0 || temps - dernierAuto < 1500)) {
        const a = ajustement();
        for (let k = 0; k < 3; k++) cam.cible[k] += (a.c[k] - cam.cible[k]) * 0.08;
        cam.dist += (a.d - cam.dist) * 0.06; sale = true; if (alpha > 0) dernierAuto = temps;
      }
      if (fluide || sale) { sale = false; dessiner(dt); }
    }
    requestAnimationFrame(boucle);

    /* --- gestes --- */
    const pts = new Map();
    let geste = null;
    const posEcran = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function toucher(x, y) {
      let meilleur = null, dm = 1e9;
      for (const n of etat.noeuds) {
        if (!n._vis) continue;
        const rr = Math.max(n._pr * 1.4, 22), d = Math.hypot(n._sx - x, n._sy - y);
        if (d >= rr) continue;
        const score = d / rr + n._z * 0.002;          // le plus centré, et le plus proche de la caméra en cas d'égalité
        if (score < dm) { meilleur = n; dm = score; }
      }
      return meilleur;
    }
    let dernierTap = { t: 0, id: null };
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* pointeur simulé */ }
      pts.set(e.pointerId, posEcran(e));
      anim = null; auto = false;
      if (pts.size === 1) {
        const [x, y] = posEcran(e);
        const n = toucher(x, y);
        geste = { type: 'un', x0: x, y0: y, x: x, y: y, bouge: false, n, surSel: !!(n && n.id === selection && mode !== 'relier') };
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        geste = { type: 'deux', d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !geste) return;
      pts.set(e.pointerId, posEcran(e));
      if (geste.type === 'un' && pts.size === 1) {
        const [x, y] = posEcran(e);
        const dx = x - geste.x, dy = y - geste.y;
        if (!geste.bouge && Math.hypot(x - geste.x0, y - geste.y0) < 7) return;
        geste.bouge = true;
        if (geste.surSel) {                       // on déplace le sommet choisi, dans le plan de l'écran
          const n = geste.n;
          n._tenu = true;
          const k = n._z / base.foc;
          n.x += (base.r[0] * dx - base.u[0] * dy) * k; n.y += (base.r[1] * dx - base.u[1] * dy) * k; n.z += (base.r[2] * dx - base.u[2] * dy) * k;
          n.fixe = true;
          reveiller(0.5);
        } else {                                  // on tourne autour de la carte
          cam.yaw -= dx * 0.0065;
          cam.pitch = borne(cam.pitch + dy * 0.0055, -1.45, 1.45);
        }
        geste.x = x; geste.y = y; sale = true;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (geste.type !== 'deux') { geste = { type: 'deux', d, mx, my }; return; }
        cam.dist = borne(cam.dist * (geste.d / Math.max(d, 1)), 2.5, 4000);
        const k = cam.dist / base.foc;
        const dx = mx - geste.mx, dy = my - geste.my;
        for (let i = 0; i < 3; i++) cam.cible[i] -= (base.r[i] * dx - base.u[i] * dy) * k;
        geste.d = d; geste.mx = mx; geste.my = my; sale = true;
      }
    });
    function fin(e) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      const g = geste;
      if (pts.size === 0) {
        geste = null;
        if (g && g.type === 'un') {
          if (g.n) g.n._tenu = false;
          if (g.bouge) { if (g.surSel) { cb.deplace && cb.deplace(g.n); reveiller(0.4); } return; }
          const n = g.n;
          if (mode === 'relier') { if (n && n.id !== selection) cb.relier && cb.relier(n); else if (!n) cb.annulerRelier && cb.annulerRelier(); return; }
          const now = Date.now();
          if (n) {
            if (dernierTap.id === n.id && now - dernierTap.t < 380) { dernierTap = { t: 0, id: null }; cb.ouvrir && cb.ouvrir(n); return; }
            dernierTap = { t: now, id: n.id };
            choisir(n.id, true);
          } else { dernierTap = { t: 0, id: null }; choisir(null); }
        }
      } else if (pts.size === 1) {
        const [x, y] = [...pts.values()][0];
        geste = { type: 'un', x0: x, y0: y, x, y, bouge: true, n: null, surSel: false };
      }
    }
    cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); auto = false; cam.dist = borne(cam.dist * Math.exp(e.deltaY * 0.0012), 2.5, 4000); sale = true; }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    function choisir(id, glisse) {
      selection = id;
      const n = id && parId.get(id);
      if (n && glisse) glisser(n);
      sale = true;
      cb.selection && cb.selection(n || null);
    }

    new ResizeObserver(redim).observe(cv);
    redim();
    reindexer();

    return {
      reindexer, redim, recentrer, cadrer, glisser, reveiller,
      choisir,
      suivre(b) { auto = b; },
      get selection() { return selection; },
      definirMode(m) { mode = m; sale = true; },
      definirFiltre(f) { filtre = f; sale = true; },
      activer(b) { actif = b; if (b) { redim(); sale = true; } },
      redessiner() { sale = true; },
      parentDe(n) { const p = S.parent.get(n.id); return p ? parId.get(p) : null; },
      enfantsDe(n) { return (S.enfants.get(n.id) || []).slice(); },
      get nbJours() { return S.jours.length; },
      camera: cam,
      placerNouveau(n, parent) {          // place un nouveau sommet près de son parent (ou de la cible de la caméra)
        const o = parent ? [parent.x, parent.y, parent.z] : cam.cible.slice();
        const v = norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]), d = parent ? 3.5 : (etat.noeuds.length ? 3 : 0);
        n.x = o[0] + v[0] * d; n.y = o[1] + v[1] * d; n.z = o[2] + v[2] * d;
      },
    };
  }

  racine.CerveauCarte = { creer, LISTE_FORMES, FORMES };
})(typeof self !== 'undefined' ? self : this);
