// Spielregeln. Reiner Zustand ohne DOM, damit Bots und Tests ihn direkt nutzen können.
import { MAPS } from './map-data.js';

export const CARD_TYPES = ['legionaer', 'reiter', 'katapult'];
export const CARD_NAMES = { legionaer: 'Legionär', reiter: 'Reiter', katapult: 'Katapult', adler: 'Adler' };
const STEIGEND = [4, 6, 8, 10, 12, 15];
const START_TROOPS = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };

export const rnd = n => Math.floor(Math.random() * n);
export const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rollDice = n => Array.from({ length: n }, () => 1 + rnd(6)).sort((a, b) => b - a);

export class Game {
  constructor(state) {
    this.s = state;
    this.map = MAPS[state.mapId];
    this.T = new Map(this.map.territories.map(t => [t.id, t]));
    this.buildGraph();
  }

  // ---------- Aufbau ----------
  static create({ mapId, settings, players }) {
    const map = MAPS[mapId];
    const ids = map.territories.map(t => t.id);
    const s = {
      v: 1, mapId, settings, round: 1, turn: 0, phase: 'setup', reinforcements: 0, tradeCount: 0,
      owner: {}, troops: {}, blocked: [], portals: [], capitals: {}, deck: [], discard: [],
      players: players.map((p, i) => ({ ...p, idx: i, alive: true, cards: [], mission: null, conqueredThisTurn: false,
        stats: { conquered: 0, lost: 0, killed: 0, diceWon: 0 } })),
      winner: null, log: [], pendingMove: null, mustTrade: false, returnPhase: null, lastAttack: null,
    };
    const g = new Game(s);
    const mods = settings.mods || {};

    // Sperrgebiete: ~10 % der Gebiete unpassierbar, Karte muss zusammenhängend bleiben
    if (mods.blocked) {
      const want = Math.max(3, Math.round(ids.length * 0.1));
      for (let tries = 0; tries < 200; tries++) {
        const pick = shuffle([...ids]).slice(0, want);
        s.blocked = pick; g.buildGraph();
        if (g.isConnected()) break;
        s.blocked = [];
      }
    }
    // Geheimpfade: 3 Paare weit auseinanderliegender Gebiete
    if (mods.portals) {
      const free = shuffle(ids.filter(id => !s.blocked.includes(id)));
      const used = new Set();
      for (const a of free) {
        if (s.portals.length >= 3 || used.has(a)) continue;
        const ta = g.T.get(a);
        const b = free.find(id => !used.has(id) && id !== a && !g.adj(a).includes(id) &&
          Math.hypot(g.T.get(id).cx - ta.cx, g.T.get(id).cy - ta.cy) > map.width * 0.3);
        if (b) { s.portals.push([a, b]); used.add(a); used.add(b); }
      }
    }
    g.buildGraph();

    // Gebiete verteilen
    for (const id of s.blocked) { s.owner[id] = -1; s.troops[id] = 0; }
    let free = shuffle(ids.filter(id => !s.blocked.includes(id)));
    const barb = s.players.find(p => p.barb);
    if (barb) {
      const n = Math.round(free.length * 0.12);
      for (const id of free.splice(0, n)) { s.owner[id] = barb.idx; s.troops[id] = 2 + rnd(2); }
    }
    const real = s.players.filter(p => !p.barb);
    free.forEach((id, i) => { const p = real[i % real.length]; s.owner[id] = p.idx; s.troops[id] = 1; });
    let start = START_TROOPS[real.length] || 20;
    // größere Karten bekommen etwas mehr Truppen
    start = Math.max(start, Math.ceil(free.length / real.length) + 10);
    for (const p of real) {
      const mine = g.owned(p.idx);
      let left = start - mine.length;
      // Startaufstellung: Schwerpunkt auf Grenzgebieten
      const borders = mine.filter(id => g.adj(id).some(n => s.owner[n] !== p.idx && s.owner[n] >= 0));
      const pool = borders.length ? borders : mine;
      while (left-- > 0) { const id = pool[rnd(pool.length)]; s.troops[id]++; }
    }

    // Feldzugkarten: jedes Gebiet eine Karte, dazu 2 Adler (Joker)
    s.deck = shuffle([...ids.filter(id => !s.blocked.includes(id)).map((id, i) => ({ t: id, type: CARD_TYPES[i % 3] })),
      { t: null, type: 'adler' }, { t: null, type: 'adler' }]);

    if (settings.mode === 'hauptstadt') {
      for (const p of real) {
        const mine = g.owned(p.idx);
        const score = id => g.adj(id).filter(n => s.owner[n] === p.idx).length * 2 - g.adj(id).filter(n => s.owner[n] !== p.idx).length + Math.random();
        const cap = mine.sort((a, b) => score(b) - score(a))[0];
        s.capitals[p.idx] = cap; s.troops[cap] += 2;
      }
    }
    if (settings.mode === 'missionen') {
      const missions = g.missionPool();
      for (const p of real) {
        let m;
        for (let k = 0; k < 50; k++) {
          m = missions[rnd(missions.length)];
          if (m.kind === 'vernichte' && m.target === p.idx) continue;
          if (real.some(o => o.mission && JSON.stringify(o.mission) === JSON.stringify(m))) continue;
          break;
        }
        p.mission = m;
      }
    }
    s.turn = s.players.findIndex(p => !p.barb);
    g.log(`Runde 1 beginnt.`);
    g.startTurn();
    return g;
  }

  // ---------- Graph ----------
  buildGraph() {
    const s = this.s; const blocked = new Set(s.blocked || []);
    this.G = new Map();
    for (const t of this.map.territories) this.G.set(t.id, t.adj.filter(n => !blocked.has(n)));
    for (const [a, b] of s.portals || []) { this.G.get(a).push(b); this.G.get(b).push(a); }
    for (const id of blocked) this.G.set(id, []);
  }
  adj(id) { return this.G.get(id) || []; }
  isConnected() {
    const ids = this.map.territories.map(t => t.id).filter(id => !this.s.blocked.includes(id));
    const seen = new Set([ids[0]]); const st = [ids[0]];
    while (st.length) for (const n of this.adj(st.pop())) if (!seen.has(n)) { seen.add(n); st.push(n); }
    return seen.size === ids.length;
  }
  owned(pi) { return Object.keys(this.s.owner).filter(id => this.s.owner[id] === pi); }
  cur() { return this.s.players[this.s.turn]; }
  contOf(id) { return this.T.get(id).cont; }
  contTerritories(c) { return this.map.territories.filter(t => t.cont === c && !this.s.blocked.includes(t.id)).map(t => t.id); }
  ownsCont(pi, c) { const ts = this.contTerritories(c); return ts.length > 0 && ts.every(id => this.s.owner[id] === pi); }
  log(msg) { this.s.log.push({ r: this.s.round, msg }); if (this.s.log.length > 200) this.s.log.shift(); }

  // ---------- Verstärkung ----------
  income(pi) {
    const n = this.owned(pi).length;
    let inc = Math.max(3, Math.floor(n / 3));
    const conts = [];
    for (const [c, info] of Object.entries(this.map.continents)) if (this.ownsCont(pi, c)) { inc += info.bonus; conts.push(info.name); }
    return { total: inc, base: Math.max(3, Math.floor(n / 3)), conts };
  }

  startTurn() {
    const s = this.s, p = this.cur();
    p.conqueredThisTurn = false;
    s.pendingMove = null; s.lastAttack = null;
    if (p.barb) {
      const mine = this.owned(p.idx);
      s.reinforcements = mine.length ? 1 + Math.floor(s.round / 2) + Math.floor(mine.length / 3) : 0;
    } else {
      s.reinforcements = this.income(p.idx).total;
    }
    s.phase = 'reinforce';
    s.mustTrade = p.cards.length >= 5;
  }

  // ---------- Feldzugkarten ----------
  setValue(cards) {
    const mode = this.s.settings.cards;
    if (mode === 'fest') {
      const types = cards.map(c => c.type).filter(t => t !== 'adler');
      const uniq = new Set(types);
      if (uniq.size === 3 || (uniq.size === 2 && types.length < 3)) return 10;
      const t = types[0] || 'katapult';
      return { legionaer: 4, reiter: 6, katapult: 8 }[t];
    }
    const k = this.s.tradeCount;
    return k < STEIGEND.length ? STEIGEND[k] : 15 + 5 * (k - STEIGEND.length + 1);
  }
  isSet(cards) {
    if (cards.length !== 3) return false;
    const types = cards.map(c => c.type).filter(t => t !== 'adler');
    const uniq = new Set(types);
    return uniq.size <= 1 || uniq.size === types.length;
  }
  // alle möglichen Sätze, bester zuerst
  sets(pi) {
    const cards = this.s.players[pi].cards; const out = [];
    for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) for (let c = b + 1; c < cards.length; c++) {
      const set = [cards[a], cards[b], cards[c]];
      if (!this.isSet(set)) continue;
      const own = set.filter(x => x.t && this.s.owner[x.t] === pi).length;
      out.push({ idx: [a, b, c], value: this.setValue(set) + own * 2, wild: set.filter(x => x.type === 'adler').length });
    }
    return out.sort((x, y) => y.value - x.value || x.wild - y.wild);
  }
  trade(idx) {
    const s = this.s, p = this.cur();
    if (s.phase !== 'reinforce') return null;
    const set = idx.map(i => p.cards[i]);
    if (!this.isSet(set)) return null;
    const val = this.setValue(set);
    if (this.s.settings.cards !== 'fest') s.tradeCount++;
    const bonusOn = [];
    for (const c of set) if (c.t && s.owner[c.t] === p.idx) { s.troops[c.t] += 2; bonusOn.push(c.t); }
    p.cards = p.cards.filter((_, i) => !idx.includes(i));
    s.discard.push(...set);
    s.reinforcements += val;
    s.mustTrade = p.cards.length >= 5;
    this.log(`${p.name} löst Feldzugkarten ein: +${val} Truppen.`);
    return { val, bonusOn };
  }
  drawCard(p) {
    const s = this.s;
    if (this.s.settings.cards === 'aus') return null;
    if (!s.deck.length) { s.deck = shuffle(s.discard); s.discard = []; }
    const c = s.deck.pop(); if (c) p.cards.push(c); return c;
  }

  place(id, n = 1) {
    const s = this.s, p = this.cur();
    if (s.phase !== 'reinforce' || s.owner[id] !== p.idx || s.mustTrade) return 0;
    n = Math.min(Math.floor(n) || 0, s.reinforcements); if (n <= 0) return 0;
    s.troops[id] += n; s.reinforcements -= n;
    return n;
  }
  unplace(id, n = 1) { // nur für die Rückgängig-Funktion der Oberfläche
    this.s.troops[id] -= n; this.s.reinforcements += n;
  }

  // ---------- Angriff ----------
  toAttack() {
    const s = this.s;
    if (s.phase !== 'reinforce' || s.reinforcements > 0 || s.mustTrade) return false;
    s.phase = s.returnPhase || 'attack'; s.returnPhase = null;
    return true;
  }
  canAttack(from, to) {
    const s = this.s, pi = s.turn;
    return s.phase === 'attack' && !s.pendingMove && s.owner[from] === pi && s.troops[from] >= 2 &&
      s.owner[to] !== pi && s.owner[to] >= 0 && this.adj(from).includes(to);
  }
  targets(from) { return this.adj(from).filter(to => this.canAttack(from, to)); }

  // ein Würfelwurf. Gibt Ergebnis zurück
  roll(from, to, attDice = 3) {
    const s = this.s;
    if (!this.canAttack(from, to)) return null;
    const a = Math.min(attDice, 3, s.troops[from] - 1);
    const d = Math.min(2, s.troops[to]);
    const ra = rollDice(a), rd = rollDice(d);
    let la = 0, ld = 0;
    for (let i = 0; i < Math.min(a, d); i++) { if (ra[i] > rd[i]) ld++; else la++; }
    s.troops[from] -= la; s.troops[to] -= ld;
    const att = this.cur(), def = s.players[s.owner[to]];
    att.stats.diceWon += ld; def.stats.diceWon += la;
    att.stats.lost += la; def.stats.lost += ld;
    const res = { from, to, ra, rd, la, ld, conquered: false, eliminated: null, dice: a };
    if (s.troops[to] <= 0) this.conquer(from, to, a, res);
    s.lastAttack = res;
    return res;
  }
  // Blitz: würfelt bis zur Eroberung oder bis nur noch `stopAt` Truppen übrig sind
  blitz(from, to, stopAt = 1) {
    const rolls = []; let r;
    while (this.canAttack(from, to) && this.s.troops[from] > Math.max(1, stopAt)) {
      r = this.roll(from, to); rolls.push(r);
      if (r.conquered) break;
    }
    return { rolls, last: r, conquered: !!(r && r.conquered) };
  }
  conquer(from, to, dice, res) {
    const s = this.s, att = this.cur(), defIdx = s.owner[to], def = s.players[defIdx];
    s.owner[to] = att.idx; s.troops[to] = 0;
    att.stats.conquered++;
    att.conqueredThisTurn = true;
    res.conquered = true;
    const max = s.troops[from] - 1, min = Math.min(dice, max);
    s.pendingMove = { from, to, min: Math.max(1, min), max };
    this.log(`${att.name} erobert ${this.T.get(to).name}.`);
    if (this.owned(defIdx).length === 0) {
      def.alive = false; def.killer = att.idx; att.stats.killed++;
      res.eliminated = defIdx;
      this.log(`${def.name} ist vernichtet.`);
      if (!def.barb) {
        att.cards.push(...def.cards); def.cards = [];
        if (att.cards.length >= 6 && !att.barb) { s.mustTradeAfterMove = true; }
      }
    }
    this.checkWin();
  }
  move(n) {
    const s = this.s, m = s.pendingMove; if (!m) return false;
    n = Math.max(m.min, Math.min(m.max, n));
    s.troops[m.from] -= n; s.troops[m.to] += n;
    s.pendingMove = null;
    if (s.mustTradeAfterMove) {
      s.mustTradeAfterMove = false;
      s.phase = 'reinforce'; s.reinforcements = 0; s.mustTrade = true; s.returnPhase = 'attack';
    }
    this.checkWin();
    return true;
  }
  // nach Pflicht-Eintausch mitten im Angriff: nur so lange tauschen, bis weniger als 5 Karten
  updateMustTrade() { const p = this.cur(); this.s.mustTrade = p.cards.length >= 5; }

  // ---------- Verlegen ----------
  toFortify() {
    const s = this.s; if (s.phase !== 'attack' || s.pendingMove) return false;
    s.phase = 'fortify'; return true;
  }
  reachable(from) {
    const s = this.s, pi = s.owner[from];
    if (s.settings.fortify === 'angrenzend') return this.adj(from).filter(n => s.owner[n] === pi);
    const seen = new Set([from]), st = [from];
    while (st.length) for (const n of this.adj(st.pop())) if (!seen.has(n) && s.owner[n] === pi) { seen.add(n); st.push(n); }
    seen.delete(from); return [...seen];
  }
  fortify(from, to, n) {
    const s = this.s;
    if (s.phase !== 'fortify' || s.owner[from] !== s.turn || !this.reachable(from).includes(to)) return false;
    n = Math.min(n, s.troops[from] - 1); if (n <= 0) return false;
    s.troops[from] -= n; s.troops[to] += n;
    this.log(`${this.cur().name} verlegt ${n} nach ${this.T.get(to).name}.`);
    return true;
  }

  endTurn() {
    const s = this.s, p = this.cur();
    if (s.phase === 'over') return;
    if (p.conqueredThisTurn && !p.barb) this.drawCard(p);
    s.pendingMove = null;
    // nächster lebender Spieler
    let i = s.turn;
    for (let k = 0; k < s.players.length; k++) {
      i = (i + 1) % s.players.length;
      if (s.players[i].alive) break;
    }
    if (i <= s.turn) { s.round++; this.log(`Runde ${s.round} beginnt.`); }
    s.turn = i;
    this.startTurn();
  }

  // ---------- Sieg ----------
  missionPool() {
    const N = this.map.territories.length - this.s.blocked.length;
    const conts = Object.keys(this.map.continents);
    const size = c => this.contTerritories(c).length;
    const pool = [];
    for (let i = 0; i < conts.length; i++) for (let j = i + 1; j < conts.length; j++) {
      const sum = size(conts[i]) + size(conts[j]);
      if (sum >= N * 0.3 && sum <= N * 0.45) pool.push({ kind: 'kontinente', conts: [conts[i], conts[j]], extra: false });
      else if (sum >= N * 0.2 && sum < N * 0.3) pool.push({ kind: 'kontinente', conts: [conts[i], conts[j]], extra: true });
    }
    pool.push({ kind: 'gebiete', n: Math.round(N * 24 / 42), min: 1 });
    pool.push({ kind: 'gebiete', n: Math.round(N * 18 / 42), min: 2 });
    for (const p of this.s.players) if (!p.barb) pool.push({ kind: 'vernichte', target: p.idx });
    return pool;
  }
  missionText(m) {
    if (!m) return '';
    const C = this.map.continents;
    if (m.kind === 'kontinente') return `Erobere ${C[m.conts[0]].name} und ${C[m.conts[1]].name}` + (m.extra ? ' sowie eine weitere Region deiner Wahl.' : '.');
    if (m.kind === 'gebiete') return m.min > 1 ? `Halte ${m.n} Gebiete mit je mindestens ${m.min} Truppen.` : `Erobere ${m.n} Gebiete.`;
    if (m.kind === 'vernichte') return `Vernichte ${this.s.players[m.target].name}. Fällt dieser Gegner durch eine andere Hand, erobere ${Math.round((this.map.territories.length - this.s.blocked.length) * 24 / 42)} Gebiete.`;
    return '';
  }
  missionDone(p) {
    const m = p.mission; if (!m) return false;
    const mine = this.owned(p.idx);
    if (m.kind === 'kontinente') {
      if (!m.conts.every(c => this.ownsCont(p.idx, c))) return false;
      if (!m.extra) return true;
      return Object.keys(this.map.continents).filter(c => this.ownsCont(p.idx, c)).length >= 3;
    }
    if (m.kind === 'gebiete') return mine.filter(id => this.s.troops[id] >= m.min).length >= m.n;
    if (m.kind === 'vernichte') {
      const t = this.s.players[m.target];
      if (!t.alive) return t.killer === p.idx || mine.length >= Math.round((this.map.territories.length - this.s.blocked.length) * 24 / 42);
      return false;
    }
    return false;
  }
  checkWin() {
    const s = this.s; if (s.phase === 'over') return;
    const alive = s.players.filter(p => p.alive && !p.barb);
    let w = null;
    if (alive.length === 1) w = alive[0];
    const p = this.cur();
    if (!w && !p.barb && p.alive) {
      if (s.settings.mode === 'missionen' && this.missionDone(p)) w = p;
      if (s.settings.mode === 'hauptstadt') {
        const caps = Object.values(s.capitals);
        if (caps.length && caps.every(id => s.owner[id] === p.idx)) w = p;
      }
    }
    if (w) { s.winner = w.idx; s.phase = 'over'; this.log(`${w.name} herrscht über die Welt.`); }
  }
}
