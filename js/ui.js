// Oberfläche: Bildschirme, Karte (SVG mit Zoomen/Verschieben), Züge des Spielers, Bot-Wiedergabe.
import { MAPS } from './map-data.js';
import { Game, CARD_NAMES } from './engine.js';
import { botTurn } from './ai.js';
import { APP, FACTIONS, BOT_FACTIONS, EMBLEMS, emblemSVG } from './config.js';
import { sound } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.appendChild(e); return e; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DEFAULT_SETUP = {
  mapId: 'welt', mode: 'klassisch', mods: { fog: false, blocked: false, portals: false, barbarians: false },
  opps: [{ f: 'germanen', lvl: 'mittel' }, { f: 'karthago', lvl: 'mittel' }, { f: 'mongolen', lvl: 'mittel' }],
  cards: 'steigend', fortify: 'verbunden', speed: 'normal', intro: 'immer', name: 'Imperator',
};
let setup = { ...DEFAULT_SETUP, ...store.get('imp.setup', {}) };
setup.mods = { ...DEFAULT_SETUP.mods, ...setup.mods };

const TIPS = [
  'Halte ganze Regionen. Jede bringt dir in jedem Zug Bonustruppen.',
  'Erobere in jedem Zug mindestens ein Gebiet, sonst gibt es keine Feldzugkarte.',
  'Wer das letzte Gebiet eines Volkes nimmt, erbeutet dessen Karten.',
  'Bei Gleichstand gewinnt der Verteidiger. Greife mit Übermacht an.',
  'Truppen im Landesinneren nützen wenig. Verlege sie an die Grenze.',
  'Blitz würfelt für dich, bis die Schlacht entschieden ist.',
  'Gestrichelte Linien sind Seewege. Auch über sie darfst du angreifen.',
];

// ---------- Bildschirme ----------
function show(id) { $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === id)); }
function applyName() {
  document.title = APP.name;
  $$('[data-app-name]').forEach(e => e.textContent = APP.name);
}

function loading(eyebrow, ms, next) {
  const L = $('#loader');
  $('#loaderEyebrow').textContent = eyebrow;
  $('#loaderTip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  L.style.setProperty('--load', ms + 'ms');
  L.classList.remove('is-loading'); void L.offsetWidth; L.classList.add('is-loading');
  const img = $('.loader__img img'); img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
  show('loader');
  setTimeout(next, ms + 250);
}

// ---------- Menü ----------
function soundIcon() {
  $('#btnSound').innerHTML = sound.on
    ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.6"/></svg>';
}
function openMenu() {
  $('#btnContinue').hidden = !store.get('imp.save', null);
  soundIcon(); show('menu');
}
$('#btnSound').onclick = () => { sound.toggle(); soundIcon(); };
$('#btnNew').onclick = () => { renderSetup(); show('setup'); };
$('#btnRules').onclick = () => show('rules');
$('#btnContinue').onclick = () => {
  const sv = store.get('imp.save', null); if (!sv) return;
  setup = { ...setup, ...sv.setup };
  loading('Der Feldzug geht weiter', 1800, () => startGame(new Game(sv.state)));
};
$$('[data-back]').forEach(b => b.onclick = openMenu);

// ---------- Einrichten ----------
function pressed(container, v) { $$('button', container).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
function bindSeg(id, key) {
  const c = $(id);
  c.onclick = e => { const b = e.target.closest('button'); if (!b) return; setup[key] = b.dataset.v; pressed(c, setup[key]); };
  pressed(c, setup[key]);
}
function renderSetup() {
  const mc = $('#mapChoice'); mc.innerHTML = '';
  for (const m of Object.values(MAPS)) {
    const b = document.createElement('button');
    b.className = 'mapcard'; b.setAttribute('aria-pressed', String(setup.mapId === m.id));
    b.innerHTML = `<svg viewBox="0 0 ${m.width} ${m.height}" preserveAspectRatio="xMidYMid meet"><path d="${m.land}"/></svg><div><b>${m.name}</b><small>${m.sub}</small></div>`;
    b.onclick = () => { setup.mapId = m.id; renderSetup(); };
    mc.appendChild(b);
  }
  bindSeg('#modeChoice', 'mode'); bindSeg('#cardsChoice', 'cards'); bindSeg('#fortChoice', 'fortify');
  bindSeg('#speedChoice', 'speed'); bindSeg('#introChoice', 'intro');
  $$('#modChoice input').forEach(i => { i.checked = !!setup.mods[i.dataset.mod]; i.onchange = () => setup.mods[i.dataset.mod] = i.checked; });
  $('#myName').value = setup.name;
  $('#myName').oninput = e => setup.name = e.target.value.trim() || 'Imperator';
  renderOpps();
}
function renderOpps() {
  $('#oppCount').textContent = setup.opps.length;
  const box = $('#opps'); box.innerHTML = '';
  setup.opps.forEach((o, i) => {
    const F = FACTIONS[o.f];
    const row = document.createElement('div'); row.className = 'opp';
    const taken = setup.opps.map(x => x.f);
    row.innerHTML = `<span class="em" style="background:${F.color};color:${F.ink}">${emblemSVG(o.f)}</span>
      <select aria-label="Volk von Gegner ${i + 1}">${BOT_FACTIONS.map(f => `<option value="${f}" ${f === o.f ? 'selected' : ''} ${f !== o.f && taken.includes(f) ? 'disabled' : ''}>${FACTIONS[f].name}</option>`).join('')}</select>
      <span class="lvl">${['leicht', 'mittel', 'schwer'].map(l => `<button data-l="${l}" aria-pressed="${o.lvl === l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}</span>`;
    $('select', row).onchange = e => { o.f = e.target.value; renderOpps(); };
    $('.lvl', row).onclick = e => { const b = e.target.closest('button'); if (b) { o.lvl = b.dataset.l; renderOpps(); } };
    box.appendChild(row);
  });
}
$('#oppMinus').onclick = () => { if (setup.opps.length > 1) { setup.opps.pop(); renderOpps(); } };
$('#oppPlus').onclick = () => {
  if (setup.opps.length >= 5) return;
  const f = BOT_FACTIONS.find(f => !setup.opps.some(o => o.f === f));
  setup.opps.push({ f, lvl: setup.opps.at(-1)?.lvl || 'mittel' }); renderOpps();
};
$('#btnStart').onclick = () => {
  store.set('imp.setup', setup);
  const players = [{ name: setup.name, faction: 'rom', human: true },
    ...setup.opps.map(o => ({ name: FACTIONS[o.f].name, faction: o.f, bot: o.lvl }))];
  if (setup.mods.barbarians) players.push({ name: 'Barbaren', faction: 'barbaren', bot: 'barb', barb: true });
  const g = Game.create({ mapId: setup.mapId, settings: { mode: setup.mode, mods: { ...setup.mods }, cards: setup.cards, fortify: setup.fortify }, players });
  sound.march();
  loading('Die Legionen sammeln sich', 2600, () => startGame(g));
};

// ---------- Spiel ----------
let G = null;
let ui = {};
let board = null;
const human = () => G.s.players.find(p => p.human);
const isHumanTurn = () => G && G.cur().human && G.s.phase !== 'over';
const F = p => FACTIONS[p.faction] || FACTIONS.barbaren;

function avatar(p) {
  const f = F(p);
  return f.portrait && p.human
    ? `<span class="av" style="--c:${f.color}"><img src="${f.portrait}" alt=""></span>`
    : `<span class="av" style="--c:${f.color};background:${f.color};color:${f.ink}">${emblemSVG(p.faction)}</span>`;
}

function startGame(g) {
  G = g;
  ui = { sel: null, target: null, amt: 1, undo: [], fortFrom: null, fortTo: null, busy: false, battleKey: null, fast: false, lastConts: null };
  show('game');
  buildBoard();
  render();
  fitView(); // erst jetzt ist die untere Leiste gefüllt und messbar
  save();
  ui.lastConts = humanConts();
  if (!store.get('imp.hintQuer', false) && innerHeight > innerWidth) { toast('Tipp: Im Querformat siehst du mehr von der Karte.'); store.set('imp.hintQuer', true); }
  nextTurn(true);
}
function save() {
  if (!G) return;
  if (G.s.phase === 'over') { store.del('imp.save'); return; }
  store.set('imp.save', { state: G.s, setup });
}

// ---------- Karte ----------
function buildBoard() {
  const m = G.map;
  const host = $('#board'); host.innerHTML = '';
  const svg = el('svg', { viewBox: `0 0 ${m.width} ${m.height}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Spielkarte' }, host);
  const defs = el('defs', {}, svg);
  const hatch = el('pattern', { id: 'hatch', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('rect', { width: 4, height: 4, fill: '#0d1015' }, hatch);
  el('path', { d: 'M0 0V4', stroke: '#3a3125', 'stroke-width': 1.3 }, hatch);
  const fogP = el('pattern', { id: 'fog', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-35)' }, defs);
  el('rect', { width: 6, height: 6, fill: '#171d27' }, fogP);
  el('path', { d: 'M0 0V6', stroke: '#1d2430', 'stroke-width': 2 }, fogP);

  const root = el('g', {}, svg);
  el('path', { d: m.grid, class: 'grid' }, root);
  el('path', { d: m.land, class: 'deco' }, root);
  const gT = el('g', {}, root);
  const paths = {};
  for (const t of m.territories) paths[t.id] = el('path', { d: t.d, class: 'terr', 'data-id': t.id }, gT);
  const gC = el('g', {}, root);
  for (const d of Object.values(m.contD)) el('path', { d, class: 'cont' }, gC);
  const gL = el('g', {}, root);
  for (const l of m.lanes) {
    if (l.wrap) {
      const a = G.T.get(l.a), b = G.T.get(l.b);
      el('path', { d: `M${a.cx - 10},${a.cy}H-6`, class: 'lane' }, gL);
      el('path', { d: `M${b.cx + 10},${b.cy}H${m.width + 6}`, class: 'lane' }, gL);
    } else el('path', { d: `M${l.p[0][0]},${l.p[0][1]}L${l.p[1][0]},${l.p[1][1]}`, class: 'lane' }, gL);
  }
  const gN = el('g', {}, root);
  const names = {};
  for (const t of m.territories) { const n = el('text', { class: 'tname' }, gN); n.textContent = t.name; names[t.id] = n; }
  const gP = el('g', {}, root);
  G.s.portals.forEach((pair, i) => pair.forEach(id => {
    const t = G.T.get(id), o = el('g', { transform: `translate(${t.cx},${t.cy})` }, gP), mid = el('g', { 'data-scale': 1 }, o);
    const g = el('g', { class: 'portal', transform: 'translate(11,-6)' }, mid);
    el('circle', { r: 5.5, class: 'glow' }, g); el('circle', { r: 4.2 }, g);
    el('text', {}, g).textContent = ['I', 'II', 'III'][i];
  }));
  const gChips = el('g', {}, root);
  const chips = {};
  for (const t of m.territories) {
    // außen: Position · Mitte: Zoom-Ausgleich · innen: Animation
    const outer = el('g', { transform: `translate(${t.cx},${t.cy})` }, gChips);
    const mid = el('g', {}, outer);
    const g = el('g', { class: 'chip' }, mid);
    const c = el('circle', { r: 7, class: 'bg' }, g);
    const cap = el('path', { d: 'M-4,-8.5L-2.4,-12.2L0,-9.6L2.4,-12.2L4,-8.5Z', class: 'cap', visibility: 'hidden' }, g);
    const tx = el('text', { y: 0.3 }, g);
    const bx = el('path', { d: 'M-3,-3L3,3M3,-3L-3,3', class: 'blockx', visibility: 'hidden' }, g);
    chips[t.id] = { g, c, tx, cap, bx, outer, mid };
  }
  const fx = el('g', {}, root);
  board = { svg, root, paths, chips, names, fx, vb: { x: 0, y: 0, w: m.width, h: m.height } };
  fitView();
  bindPanZoom();
}

function fitView() {
  const m = G.map, r = board.svg.getBoundingClientRect();
  const short = innerHeight <= 500;
  const pad = 1.03, topPad = short ? 50 : 66, botPad = short ? 6 : ($('#dock').offsetHeight || 110) + 18;
  const usableH = Math.max(200, r.height - topPad - botPad);
  // Kartenbreite oder -höhe passend in den freien Bereich zwischen Leisten
  const k = Math.max(m.width * pad / r.width, m.height * pad / usableH);
  const w = r.width * k, h = r.height * k;
  board.vb = { x: (m.width - w) / 2, y: (m.height - h) / 2 + (botPad - topPad) / 2 * k, w, h };
  board.home = { ...board.vb };
  applyView();
}
function applyView() {
  const v = board.vb; board.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  const ppu = 1 / scaleK();
  if (Math.abs(ppu - (board.ppu || 0)) > 0.002) { board.ppu = ppu; updateScale(); }
}
// Truppenzahlen und Namen bleiben beim Zoomen lesbar groß
function updateScale() {
  const ppu = board.ppu;
  const cs = Math.min(Math.max(7 * ppu, 9.5), 13) / (7 * ppu);
  const showNames = ppu > 0.8;
  const ns = Math.max(1, 8.2 / (6.2 * ppu)) * Math.min(1, 1.6 / ppu + .25);
  for (const t of G.map.territories) {
    board.chips[t.id].mid.setAttribute('transform', `scale(${cs.toFixed(3)})`);
    const n = board.names[t.id];
    n.setAttribute('transform', `translate(${t.cx},${(t.cy - 7 * cs - 2.5 * ns).toFixed(1)}) scale(${ns.toFixed(3)})`);
    n.style.display = showNames ? '' : 'none';
  }
  board.root.querySelectorAll('[data-scale]').forEach(e => e.setAttribute('transform', `scale(${cs.toFixed(3)})`));
}
function scaleK() { const r = board.svg.getBoundingClientRect(); return Math.max(board.vb.w / r.width, board.vb.h / r.height); }
function zoomAt(cx, cy, f) {
  const v = board.vb, r = board.svg.getBoundingClientRect(), k = scaleK();
  const nw = Math.min(board.home.w * 1.4, Math.max(G.map.width / 7, v.w * f)); f = nw / v.w;
  const px = v.x + (cx - r.left) * k, py = v.y + (cy - r.top) * k;
  v.x = px - (px - v.x) * f; v.y = py - (py - v.y) * f; v.w *= f; v.h *= f;
  clampView(); applyView();
}
function clampView() {
  const v = board.vb, m = G.map;
  const mx = Math.max(0, v.w - m.width) / 2 + v.w * 0.3, my = Math.max(0, v.h - m.height) / 2 + v.h * 0.3;
  v.x = Math.min(m.width - v.w + mx, Math.max(-mx, v.x));
  v.y = Math.min(m.height - v.h + my, Math.max(-my, v.y));
}
function bindPanZoom() {
  const svg = board.svg, pts = new Map();
  let start = null, pinch = null, moved = false;
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, vx: board.vb.x, vy: board.vb.y, t: performance.now() }; moved = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; moved = true; }
  });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.d / d); pinch.d = d;
      start = null;
    } else if (pts.size === 1 && start) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) > 8) moved = true;
      if (moved) { const k = scaleK(); board.vb.x = start.vx - dx * k; board.vb.y = start.vy - dy * k; clampView(); applyView(); }
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0 && !moved && start) {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.terr');
      if (target) onTap(target.dataset.id);
      else onTap(null);
    }
    if (pts.size === 1) { const p = [...pts.values()][0]; start = { x: p.x, y: p.y, vx: board.vb.x, vy: board.vb.y }; }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', e => { pts.delete(e.pointerId); pinch = null; });
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  svg.addEventListener('dblclick', e => zoomAt(e.clientX, e.clientY, 0.6));
}

function visible(id) {
  if (!G.s.settings.mods?.fog) return true;
  const h = human(); if (!h.alive) return true;
  if (G.s.owner[id] === h.idx) return true;
  return G.adj(id).some(n => G.s.owner[n] === h.idx);
}

function render() {
  const s = G.s, h = human();
  const capOf = new Set(Object.values(s.capitals));
  const sel = ui.sel || ui.fortFrom;
  const targets = new Set(
    ui.sel && s.phase === 'attack' ? G.targets(ui.sel) :
    ui.fortFrom && s.phase === 'fortify' ? G.reachable(ui.fortFrom) : []);
  for (const t of G.map.territories) {
    const id = t.id, p = board.paths[id], ch = board.chips[id];
    const o = s.owner[id];
    p.classList.remove('is-sel', 'is-target', 'is-dim');
    ch.bx.setAttribute('visibility', o === -1 ? 'visible' : 'hidden');
    if (o === -1) { // Sperrgebiet
      p.setAttribute('fill', 'url(#hatch)'); p.setAttribute('fill-opacity', 1);
      ch.c.setAttribute('fill', '#0c0f14'); ch.tx.textContent = ''; ch.cap.setAttribute('visibility', 'hidden'); ch.c.setAttribute('r', 6);
      continue;
    }
    if (!visible(id)) {
      p.setAttribute('fill', 'url(#fog)'); p.setAttribute('fill-opacity', 1);
      ch.c.setAttribute('fill', '#2a313c'); ch.tx.setAttribute('fill', '#8a8f99'); ch.tx.textContent = '?';
      ch.cap.setAttribute('visibility', 'hidden'); ch.c.setAttribute('r', 7);
      continue;
    }
    const f = F(s.players[o]);
    p.setAttribute('fill', f.color); p.setAttribute('fill-opacity', o === h.idx ? .76 : .56);
    ch.c.setAttribute('fill', f.color); ch.tx.setAttribute('fill', f.ink);
    ch.tx.textContent = s.troops[id];
    ch.c.setAttribute('r', s.troops[id] >= 100 ? 8.6 : 7);
    ch.cap.setAttribute('visibility', capOf.has(id) ? 'visible' : 'hidden');
    if (id === sel) p.classList.add('is-sel');
    else if (targets.has(id)) p.classList.add('is-target');
    else if (sel && isHumanTurn()) p.classList.add('is-dim');
  }
  renderHud();
  renderDock();
}

function floatText(id, txt, color) {
  const t = G.T.get(id); if (!visible(id)) return;
  const e = el('text', { x: t.cx, y: t.cy - 9, class: 'float', fill: color }, board.fx); e.textContent = txt;
  setTimeout(() => e.remove(), 1150);
}
function pop(id) { const g = board.chips[id].g; g.classList.remove('is-pop'); void g.getBBox(); g.classList.add('is-pop'); }
function arrow(from, to, ms = 600) {
  if (!visible(from) && !visible(to)) return;
  const a = G.T.get(from), b = G.T.get(to);
  const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2 - Math.hypot(b.cx - a.cx, b.cy - a.cy) * 0.25;
  const e = el('path', { d: `M${a.cx},${a.cy}Q${mx},${my} ${b.cx},${b.cy}`, class: 'arrow' }, board.fx);
  setTimeout(() => e.remove(), ms);
}

// ---------- HUD ----------
const PHASE = { reinforce: 'Verstärken', attack: 'Angreifen', fortify: 'Verlegen', over: 'Ende' };
function renderHud() {
  const p = G.cur();
  $('#hudPlayer').innerHTML = `<div class="pchip">${avatar(p)}<div><b>${esc(p.name)}</b><small>Runde ${G.s.round} · ${p.human ? PHASE[G.s.phase] : 'am Zug'}</small></div></div>`;
  const h = human();
  $('#cardCount').textContent = h.cards.length;
  $('#cardCount').hidden = G.s.settings.cards === 'aus';
  $('#btnCards').hidden = G.s.settings.cards === 'aus';
  $('#btnMission').hidden = !h.mission;
}

// ---------- Dock (untere Leiste) ----------
function dock(html) { const d = $('#dock'); d.classList.toggle('is-hidden', !html); if (html) d.innerHTML = html; return d; }
function renderDock() {
  const s = G.s;
  if (s.phase === 'over') return dock('');
  const p = G.cur();
  if (!p.human) {
    const d = dock(`<div class="dock__row">${avatar(p).replace('class="av"', 'class="av" style="width:34px;height:34px"')}
      <div class="dock__info"><b>${esc(p.name)}</b><small>${p.barb ? 'Die Horden ziehen' : 'Der Gegner zieht'}</small></div>
      <button class="btn btn--sm" id="dFast">${ui.fast ? 'Läuft schnell' : 'Schneller'}</button></div>`);
    $('#dFast', d).onclick = () => { ui.fast = true; renderDock(); };
    return;
  }
  if (s.phase === 'reinforce') {
    if (s.mustTrade) {
      const d = dock(`<div class="dock__row"><div class="dock__info"><b>Feldzugkarten</b><small>Du hältst ${p.cards.length} Karten und musst einen Satz einlösen.</small></div>
        <button class="btn btn--primary btn--sm" id="dCards">Karten öffnen</button></div>`);
      $('#dCards', d).onclick = openCards; return;
    }
    const sets = G.sets(p.idx).length;
    const d = dock(`<div class="dock__row"><span class="big">${s.reinforcements}</span>
      <div class="dock__info"><b>Verstärkung</b><small>${s.reinforcements ? 'Tippe auf deine Gebiete' : 'Alle Truppen stehen'}</small></div>
      <div class="chips" id="dAmt"><button data-a="1">1</button><button data-a="5">5</button><button data-a="all">Alle</button></div></div>
      <div class="dock__row"><button class="btn btn--sm btn--ghost" id="dUndo" ${ui.undo.length ? '' : 'disabled'}>Zurück</button>
      ${s.settings.cards !== 'aus' ? `<button class="btn btn--sm btn--ghost" id="dCards">Karten${sets ? ' · Satz bereit' : ''}</button>` : ''}
      <span style="flex:1"></span><button class="btn btn--primary btn--sm" id="dNext" ${s.reinforcements ? 'disabled' : ''}>Zum Angriff</button></div>`);
    $$('#dAmt button', d).forEach(b => { b.setAttribute('aria-pressed', String(String(ui.amt) === b.dataset.a)); b.onclick = () => { ui.amt = b.dataset.a === 'all' ? 'all' : +b.dataset.a; renderDock(); }; });
    $('#dUndo', d).onclick = () => { const u = ui.undo.pop(); if (u) { G.unplace(u.id, u.n); render(); } };
    if ($('#dCards', d)) $('#dCards', d).onclick = openCards;
    $('#dNext', d).onclick = () => { if (G.toAttack()) { ui.undo = []; ui.sel = null; render(); save(); } };
    return;
  }
  if (s.phase === 'attack' && s.pendingMove) return dockMove(s.pendingMove, 'Einmarsch', 'Einmarschieren', n => { doMove(n); });
  if (s.phase === 'attack' && ui.sel && ui.target && G.canAttack(ui.sel, ui.target)) {
    return dockBattle(ui.last && ui.last.from === ui.sel && ui.last.to === ui.target ? ui.last : null);
  }
  if (s.phase === 'attack') {
    const hint = ui.sel
      ? `Wähle ein Ziel neben ${esc(G.T.get(ui.sel).name)}. Angriffe kannst du beliebig oft machen.`
      : 'Wähle ein eigenes Gebiet mit mindestens 2 Truppen. Angriffe kannst du beliebig oft machen.';
    const d = dock(`<div class="dock__row"><div class="dock__info"><b>Angriff</b><small>${hint}</small></div>
      <button class="btn btn--sm" id="dNext">Zum Verlegen</button></div>`);
    $('#dNext', d).onclick = endAttack;
    return;
  }
  if (s.phase === 'fortify') {
    if (ui.fortFrom && ui.fortTo) {
      const max = s.troops[ui.fortFrom] - 1;
      return dockMove({ from: ui.fortFrom, to: ui.fortTo, min: 1, max }, 'Verlegen', 'Verlegen', n => {
        G.fortify(ui.fortFrom, ui.fortTo, n); pop(ui.fortTo); sound.drum(0, .5);
        ui.fortFrom = ui.fortTo = null; endHumanTurn();
      }, () => { ui.fortTo = null; render(); });
    }
    const d = dock(`<div class="dock__row"><div class="dock__info"><b>Verlegen</b><small>${ui.fortFrom ? 'Wähle das Zielgebiet' : 'Ein Truppenzug zwischen eigenen Gebieten, dann endet dein Zug'}</small></div>
      <button class="btn btn--primary btn--sm" id="dEnd">Zug beenden</button></div>`);
    $('#dEnd', d).onclick = () => { ui.fortFrom = null; endHumanTurn(); };
  }
}

function dockMove(m, title, verb, done, cancel) {
  const s = G.s;
  const val = m.max;
  const d = dock(`<div class="dock__row"><div class="dock__info"><b>${title}</b><small>${esc(G.T.get(m.from).name)} nach ${esc(G.T.get(m.to).name)}</small></div><span class="big" id="mVal">${val}</span></div>
    <div class="dock__row"><input type="range" class="range" id="mRange" min="${m.min}" max="${m.max}" value="${val}" aria-label="Anzahl Truppen" ${m.min === m.max ? 'disabled' : ''}></div>
    <div class="dock__row">${cancel ? '<button class="btn btn--sm btn--ghost" id="mCancel">Abbrechen</button>' : ''}
      <button class="btn btn--sm btn--ghost" id="mMin">Min</button><button class="btn btn--sm btn--ghost" id="mMax">Max</button>
      <span style="flex:1"></span><button class="btn btn--primary btn--sm" id="mGo">${verb}</button></div>`);
  const r = $('#mRange', d), v = $('#mVal', d);
  const upd = () => { v.textContent = r.value; r.style.setProperty('--p', m.max > m.min ? ((r.value - m.min) / (m.max - m.min) * 100) + '%' : '100%'); };
  r.oninput = upd; upd();
  $('#mMin', d).onclick = () => { r.value = m.min; upd(); };
  $('#mMax', d).onclick = () => { r.value = m.max; upd(); };
  $('#mGo', d).onclick = () => done(+r.value);
  if (cancel) $('#mCancel', d).onclick = cancel;
}

function dieHTML(v, p, lose) {
  const f = F(p); const on = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[v];
  return `<span class="die is-roll ${lose ? 'is-lose' : ''}" style="--c:${f.color};--ink:${f.ink}">${Array.from({ length: 9 }, (_, i) => `<i style="opacity:${on.includes(i + 1) ? 1 : 0}"></i>`).join('')}</span>`;
}
function dockBattle(last) {
  const s = G.s, a = ui.sel, t = ui.target, A = s.players[s.owner[a]], D = s.players[s.owner[t]];
  let dice = '';
  if (last) {
    const pairs = Math.min(last.ra.length, last.rd.length);
    dice = `<div class="dock__row" style="justify-content:center;gap:18px"><div class="dice">${last.ra.map((v, i) => dieHTML(v, A, i < pairs && v <= last.rd[i])).join('')}</div>
      <span class="vs">${last.la ? '−' + last.la : ''} · ${last.ld ? '−' + last.ld : ''}</span>
      <div class="dice">${last.rd.map((v, i) => dieHTML(v, D, i < pairs && last.ra[i] > v)).join('')}</div></div>`;
  }
  const d = dock(`<div class="duel"><div class="side">${avatar(A)}<div><b>${s.troops[a]}</b><small>${esc(G.T.get(a).name)}</small></div></div>
    <span class="vs">gegen</span>
    <div class="side side--def">${avatar(D)}<div><b>${s.troops[t]}</b><small>${esc(G.T.get(t).name)}</small></div></div></div>
    ${dice}
    <div class="dock__row"><button class="btn btn--sm btn--ghost" id="bBack">Anderes Ziel</button><button class="btn btn--sm btn--ghost" id="bEnd">Verlegen</button><span style="flex:1"></span>
    <button class="btn btn--sm" id="bOne">Angreifen</button><button class="btn btn--primary btn--sm" id="bBlitz">Blitz</button></div>`);
  $('#bBack', d).onclick = () => { ui.target = null; ui.last = null; render(); };
  $('#bEnd', d).onclick = endAttack;
  $('#bOne', d).onclick = () => attackOnce();
  $('#bBlitz', d).onclick = () => attackBlitz();
}
// Schlachtzug beenden: Angriffsphase vorbei, es folgt das Verlegen
function endAttack() {
  if (ui.busy) return;
  ui.sel = null; ui.target = null; ui.last = null;
  if (G.toFortify()) { render(); save(); }
}

// ---------- Spielzüge des Menschen ----------
function onTap(id) {
  if (!isHumanTurn() || ui.busy) return;
  const s = G.s, me = G.cur().idx;
  if (id === null) { if (!s.pendingMove) { ui.sel = null; ui.target = null; if (!ui.fortTo) ui.fortFrom = null; render(); } return; }
  if (s.phase === 'reinforce') {
    if (s.mustTrade) { openCards(); return; }
    if (s.owner[id] !== me) { toast('Verstärken kannst du nur eigene Gebiete.'); return; }
    const n = G.place(id, ui.amt === 'all' ? s.reinforcements : ui.amt);
    if (n) { ui.undo.push({ id, n }); pop(id); floatText(id, '+' + n, '#e2c27a'); sound.tick(); render(); }
    return;
  }
  if (s.phase === 'attack') {
    if (s.pendingMove) return;
    if (s.owner[id] === me) {
      if (ui.sel === id) { ui.sel = null; ui.target = null; render(); return; }
      if (s.troops[id] < 2) { toast('Für einen Angriff brauchst du mindestens 2 Truppen.'); return; }
      if (!G.targets(id).length) { toast('Von hier aus ist kein Gegner erreichbar.'); return; }
      ui.sel = id; ui.target = null; render(); return;
    }
    if (ui.sel && G.canAttack(ui.sel, id)) { selectTarget(id); return; }
    if (ui.sel) toast('Dieses Gebiet grenzt nicht an dein gewähltes Gebiet.');
    else toast('Wähle zuerst ein eigenes Gebiet.');
    return;
  }
  if (s.phase === 'fortify') {
    if (ui.fortTo) return;
    if (s.owner[id] !== me) return;
    if (ui.fortFrom && G.reachable(ui.fortFrom).includes(id)) { ui.fortTo = id; render(); return; }
    if (ui.fortFrom === id) { ui.fortFrom = null; render(); return; }
    if (s.troops[id] < 2) { toast('Hier steht nur eine Truppe.'); return; }
    if (!G.reachable(id).length) { toast('Kein eigenes Gebiet erreichbar.'); return; }
    ui.fortFrom = id; render();
  }
}

async function selectTarget(id) {
  ui.target = id;
  const key = ui.sel + '>' + id;
  const s = G.s;
  const big = s.troops[ui.sel] + s.troops[id] >= 12;
  if (ui.battleKey !== key && (setup.intro === 'immer' || (setup.intro === 'gross' && big))) {
    ui.battleKey = key;
    const A = G.cur(), D = s.players[s.owner[id]];
    await playIntro(`${F(A).name} gegen ${F(D).name}`, `Schlacht um ${G.T.get(id).name}`, `${s.troops[ui.sel] - 1} Angreifer gegen ${s.troops[id]} Verteidiger`);
  }
  ui.battleKey = key;
  render();
}

function playIntro(eyebrow, title, vs) {
  return new Promise(res => {
    const I = $('#intro');
    $('#introEyebrow').textContent = eyebrow; $('#introTitle').textContent = title; $('#introVs').textContent = vs;
    I.classList.remove('is-off'); I.classList.add('is-on');
    sound.march();
    let done = false;
    const end = () => { if (done) return; done = true; I.classList.add('is-off'); setTimeout(() => { I.classList.remove('is-on', 'is-off'); res(); }, 420); };
    I.onclick = end; setTimeout(end, 1900);
  });
}

function afterRoll(res) {
  if (res.la) floatText(res.from, '−' + res.la, '#ff8f80');
  if (res.ld) floatText(res.to, '−' + res.ld, '#ff8f80');
  pop(res.to); if (res.la) pop(res.from);
}
function attackOnce() {
  if (ui.busy) return;
  const res = G.roll(ui.sel, ui.target); if (!res) return;
  sound.clash(); navigator.vibrate?.(12);
  afterRoll(res); ui.last = res;
  if (res.conquered) return conquered(res);
  if (!G.canAttack(ui.sel, ui.target)) {
    ui.sel = null; ui.target = null; ui.last = null;
    toast('Von dort aus kann niemand mehr angreifen. Wähle ein anderes Gebiet oder verlege.');
  }
  render();
}
async function attackBlitz() {
  if (ui.busy) return; ui.busy = true;
  let res, k = 0;
  while (G.canAttack(ui.sel, ui.target)) {
    res = G.roll(ui.sel, ui.target);
    if (k++ < 6) { sound.clash(.35); afterRoll(res); render(); dockBattle(res); await sleep(140); }
    if (res.conquered) break;
  }
  ui.busy = false;
  if (!res) return;
  afterRoll(res);
  if (res.conquered) return conquered(res);
  ui.last = res;
  if (!G.canAttack(ui.sel, ui.target)) {
    ui.sel = null; ui.target = null; ui.last = null;
    toast(`Der Angriff auf ${G.T.get(res.to).name} ist gescheitert. Wähle ein Ziel oder verlege.`);
  }
  render();
}
function conquered(res) {
  sound.drum(); navigator.vibrate?.([20, 40, 30]);
  board.paths[res.to].classList.add('is-flash'); setTimeout(() => board.paths[res.to].classList.remove('is-flash'), 700);
  if (res.eliminated !== null) toast(`<b>${esc(G.s.players[res.eliminated].name)}</b> ist vernichtet.`, true);
  ui.target = null;
  if (G.s.phase === 'over') { render(); return finish(); }
  const m = G.s.pendingMove;
  if (m && m.min === m.max) { doMove(m.max); return; }
  render();
}
function doMove(n) {
  const m = G.s.pendingMove; if (!m) return;
  G.move(n); pop(m.to);
  checkConts();
  if (G.s.phase === 'over') { render(); return finish(); }
  if (G.s.phase === 'reinforce') { toast('Du hast viele Karten erbeutet. Löse sie jetzt ein.', true); ui.sel = null; render(); openCards(); return; }
  ui.sel = G.s.troops[m.to] >= 2 && G.targets(m.to).length ? m.to : (G.s.troops[m.from] >= 2 && G.targets(m.from).length ? m.from : null);
  render(); save();
}
function humanConts() { const h = human(); return Object.keys(G.map.continents).filter(c => G.ownsCont(h.idx, c)); }
function checkConts() {
  const now = humanConts(), before = ui.lastConts || [];
  for (const c of now) if (!before.includes(c)) toast(`<b>${G.map.continents[c].name}</b> gehört dir. +${G.map.continents[c].bonus} Truppen pro Zug.`, true);
  for (const c of before) if (!now.includes(c)) toast(`Du hast die Kontrolle über <b>${G.map.continents[c].name}</b> verloren.`);
  ui.lastConts = now;
}

function endHumanTurn() {
  ui.sel = ui.target = ui.fortFrom = ui.fortTo = null;
  const h = human(), before = h.cards.length;
  G.endTurn();
  if (h.cards.length > before) { const c = h.cards.at(-1); toast(`Feldzugkarte erhalten: <b>${CARD_NAMES[c.type]}</b>${c.t ? ' · ' + esc(G.T.get(c.t).name) : ''}`, true); }
  save(); nextTurn();
}

// ---------- Ablauf ----------
async function nextTurn(first) {
  render();
  if (G.s.phase === 'over') return finish();
  const p = G.cur();
  if (p.human) {
    ui.undo = []; ui.amt = 1; ui.fast = false;
    sound.horn();
    const inc = G.income(p.idx);
    toast(`Dein Zug · Runde ${G.s.round}. +${inc.total} Truppen${inc.conts.length ? ' (davon Regionen: ' + inc.conts.join(', ') + ')' : ''}`);
    if (G.s.mustTrade) openCards();
    return;
  }
  await runBot();
}

async function runBot() {
  ui.busy = true; ui.fast = false;
  const speedOf = () => ui.fast || setup.speed === 'schnell' ? .3 : setup.speed === 'sofort' ? 0 : 1;
  renderHud(); renderDock();
  await sleep(250 * speedOf());
  for (const ev of botTurn(G)) {
    const sp = speedOf();
    if (!sp) continue;
    if (ev.type === 'place') { if (visible(ev.id)) { pop(ev.id); floatText(ev.id, '+' + ev.n, '#e2c27a'); render(); await sleep(260 * sp); } }
    else if (ev.type === 'trade') { toast(`${esc(G.cur().name)} löst Feldzugkarten ein: +${ev.val}`); await sleep(300 * sp); }
    else if (ev.type === 'roll') {
      const r = ev.res;
      if (visible(r.from) || visible(r.to)) {
        arrow(r.from, r.to, 420 * sp + 100); afterRoll(r); sound.clash(.25); render();
        await sleep((r.conquered ? 420 : 170) * sp);
      }
      if (r.conquered && r.eliminated !== null) toast(`<b>${esc(G.s.players[r.eliminated].name)}</b> ist vernichtet.`, true);
    }
    else if (ev.type === 'move') { render(); await sleep(150 * sp); }
    else if (ev.type === 'fortify') { if (visible(ev.to)) { arrow(ev.from, ev.to, 500 * sp + 100); pop(ev.to); render(); await sleep(450 * sp); } }
    if (G.s.phase === 'over') break;
  }
  ui.busy = false;
  checkConts();
  if (G.s.phase === 'over') { render(); return finish(); }
  if (!human().alive) { render(); return finish(); }
  G.endTurn(); save();
  nextTurn();
}

// ---------- Blätter: Karten, Heere, Auftrag, Menü ----------
const CARD_ICON = {
  legionaer: '<svg viewBox="0 0 24 24"><path d="M12 2l2 3v10h-4V5z" fill="currentColor"/><path d="M7 15.5h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M11 17h2v5h-2z" fill="currentColor"/></svg>',
  reiter: '<svg viewBox="0 0 24 24"><path d="M6.5 4v8a5.5 5.5 0 0011 0V4" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  katapult: '<svg viewBox="0 0 24 24"><path d="M3 20h18M6 20l3-5h6l3 5M8 15L18.5 5.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="19" cy="4.8" r="2.2" fill="currentColor"/></svg>',
  adler: `<svg viewBox="0 0 24 24">${EMBLEMS.adler}</svg>`,
};
function sheet(html) {
  const S = $('#sheet'); S.innerHTML = html; S.classList.add('is-open');
  $('[data-close]', S)?.addEventListener('click', closeSheet);
  return S;
}
function closeSheet() { $('#sheet').classList.remove('is-open'); }
const sheetHead = t => `<div class="sheet__head"><h2 class="h2">${t}</h2><button class="iconbtn" data-close aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6"/></svg></button></div>`;

function openCards() {
  const h = human(), s = G.s;
  let picked = [];
  const draw = () => {
    const canTrade = isHumanTurn() && s.phase === 'reinforce';
    const set = picked.map(i => h.cards[i]);
    const valid = picked.length === 3 && G.isSet(set);
    const next = s.settings.cards === 'fest' ? 'je nach Satz 4 bis 10' : G.setValue([]);
    const S = sheet(`${sheetHead('Feldzugkarten')}
      <p class="note">Drei gleiche oder drei verschiedene Karten ergeben einen Satz. Der Adler ersetzt jede Karte. Nächster Tausch: <b style="color:var(--gold-2)">${next}</b> Truppen.</p>
      ${s.mustTrade && canTrade ? '<p class="note" style="color:var(--gold-2)">Du hältst 5 oder mehr Karten und musst tauschen.</p>' : ''}
      <div class="cards">${h.cards.map((c, i) => `<button class="card ${c.t && s.owner[c.t] === h.idx ? 'is-own' : ''}" data-i="${i}" aria-pressed="${picked.includes(i)}">
        ${CARD_ICON[c.type]}<b>${CARD_NAMES[c.type]}</b><small>${c.t ? esc(G.T.get(c.t).name) : 'Joker'}</small></button>`).join('') || '<p class="note">Noch keine Karten. Erobere in einem Zug mindestens ein Gebiet.</p>'}</div>
      ${canTrade ? `<div class="dock__row"><button class="btn btn--sm btn--ghost" id="cBest" ${G.sets(h.idx).length ? '' : 'disabled'}>Besten Satz wählen</button><span style="flex:1"></span>
        <button class="btn btn--primary btn--sm" id="cTrade" ${valid ? '' : 'disabled'}>Einlösen</button></div>` : '<p class="note">Karten tauschst du zu Beginn deines Zuges ein.</p>'}`);
    $$('.card', S).forEach(b => b.onclick = () => { const i = +b.dataset.i; picked = picked.includes(i) ? picked.filter(x => x !== i) : picked.length < 3 ? [...picked, i] : picked; draw(); });
    if ($('#cBest', S)) $('#cBest', S).onclick = () => { picked = G.sets(h.idx)[0]?.idx || []; draw(); };
    if ($('#cTrade', S)) $('#cTrade', S).onclick = () => {
      const r = G.trade(picked); if (!r) return;
      sound.drum(); r.bonusOn.forEach(id => { pop(id); floatText(id, '+2', '#e2c27a'); });
      toast(`+${r.val} Truppen aus Feldzugkarten`, true);
      picked = []; render(); if (!G.s.mustTrade) closeSheet(); else draw();
    };
  };
  draw();
}

function openPlayers() {
  const s = G.s;
  const rows = s.players.map(p => {
    const mine = G.owned(p.idx);
    const troops = mine.reduce((a, id) => a + (visible(id) ? s.troops[id] : 0), 0);
    const fog = s.settings.mods?.fog && !p.human;
    return `<div class="prow ${p.alive ? '' : 'is-dead'}">${avatar(p)}<div><b>${esc(p.name)}</b><small>${p.alive ? (p.human ? 'Du' : p.barb ? 'Neutral' : 'Bot · ' + p.bot) : 'vernichtet'}</small></div>
      <div class="nums"><b>${mine.length}</b> Gebiete<br>${fog ? '?' : troops} Truppen${s.settings.cards !== 'aus' && !p.barb ? ' · ' + p.cards.length + ' Karten' : ''}</div></div>`;
  }).join('');
  const conts = Object.entries(G.map.continents).map(([c, info]) => {
    const own = s.players.find(p => G.ownsCont(p.idx, c));
    return `<div><span>${info.name}${own ? ` <span style="color:${F(own).color}">· ${esc(own.name)}</span>` : ''}</span><b>+${info.bonus}</b></div>`;
  }).join('');
  sheet(`${sheetHead('Heere')}${rows}<h3 class="label" style="margin-top:24px">Regionen und Bonus</h3><div class="conts">${conts}</div>`);
}
function openMission() {
  const h = human();
  sheet(`${sheetHead('Geheimauftrag')}<div class="mission">${esc(G.missionText(h.mission))}</div><p class="note" style="margin-top:14px">Die Gegner haben eigene Aufträge, die du nicht kennst.</p>`);
}
function openPause() {
  const S = sheet(`${sheetHead('Feldzug')}
    <div class="menu__nav" style="width:100%;margin-top:0">
      <button class="btn" id="pResume">Weiterspielen</button>
      <button class="btn" id="pView">Karte zentrieren</button>
      <button class="btn" id="pSound">Ton ${sound.on ? 'aus' : 'an'}</button>
      <button class="btn" id="pRules">Spielregeln</button>
      <button class="btn" id="pMenu">Zum Hauptmenü</button>
    </div><p class="note" style="margin-top:16px">Der Feldzug wird automatisch gespeichert.</p>`);
  $('#pResume', S).onclick = closeSheet;
  $('#pView', S).onclick = () => { board.vb = { ...board.home }; applyView(); closeSheet(); };
  $('#pSound', S).onclick = () => { sound.toggle(); openPause(); };
  $('#pRules', S).onclick = () => { closeSheet(); show('rules'); $$('[data-back]').forEach(b => b.onclick = () => { show('game'); $$('[data-back]').forEach(x => x.onclick = openMenu); }); };
  $('#pMenu', S).onclick = () => { closeSheet(); save(); G = null; openMenu(); };
}
$('#btnCards').onclick = openCards;
$('#btnPlayers').onclick = openPlayers;
$('#btnMission').onclick = openMission;
$('#btnMenu').onclick = openPause;

// ---------- Hinweise ----------
function toast(html, gold) {
  const t = document.createElement('div'); t.className = 'toast' + (gold ? ' toast--gold' : ''); t.innerHTML = html;
  const box = $('#toasts'); box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), 3400);
}

// ---------- Ende ----------
function finish() {
  if (!G || ui.finished) return; ui.finished = true;
  const s = G.s, h = human();
  const win = s.winner === h.idx;
  const w = s.players[s.winner];
  store.del('imp.save');
  if (win) sound.march(); else sound.drum(0, .8);
  setTimeout(() => {
    const E = $('#end');
    E.innerHTML = `<img src="assets/img/${win ? 'legion' : 'kommandant'}.webp" alt="">
      <div class="end__body"><p class="eyebrow">${win ? 'Der Senat jubelt' : 'Der Feldzug ist verloren'}</p>
      <h1 class="title title--xl">${win ? 'Sieg' : 'Niederlage'}</h1>
      <p class="lede" style="margin:18px auto 0">${win ? `${esc(h.name)} herrscht über ${G.map.id === 'orbis' ? 'die Alte Welt' : 'die Welt'}.` : w ? `${esc(w.name)} hat den Feldzug gewonnen.` : 'Rom ist gefallen.'}</p>
      <div class="end__stats"><div><b>${s.round}</b>Runden</div><div><b>${h.stats.conquered}</b>Eroberungen</div><div><b>${h.stats.killed}</b>Völker besiegt</div></div>
      <div class="end__btns"><button class="btn btn--primary" id="eNew">Neuer Feldzug</button><button class="btn" id="eMenu">Hauptmenü</button></div></div>`;
    $('#eNew', E).onclick = () => { renderSetup(); show('setup'); };
    $('#eMenu', E).onclick = openMenu;
    show('end');
  }, win ? 900 : 1400);
}

// ---------- Start ----------
applyName();
addEventListener('resize', () => { if (G && board && $('#game').classList.contains('is-active')) { const v = board.vb; fitView(); if (v.w < board.home.w * .95) { board.vb = v; clampView(); applyView(); } } });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
loading('Die Legionen sammeln sich', 2400, openMenu);
