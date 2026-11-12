// Bot-Gegner. botTurn() ist ein Generator: Jeder Schritt wird von der Oberfläche
// mit kurzer Pause abgespielt; in Tests läuft er einfach durch.
import { rnd } from './engine.js';

export const LEVEL = {
  leicht: { ratio: 2.0, maxAttacks: 6, focus: 0.4, tradeEarly: false, chase: 0.6, def: 0.2 },
  mittel: { ratio: 1.35, maxAttacks: 25, focus: 0.75, tradeEarly: false, chase: 0.75, def: 0.35 },
  schwer: { ratio: 1.25, maxAttacks: 60, focus: 0.95, tradeEarly: false, chase: 0.65, def: 0.6, smart: true, patient: 1.2, moveAll: true },
};

function ctx(g) {
  const s = g.s, me = s.turn;
  const enemyN = id => g.adj(id).filter(n => s.owner[n] !== me && s.owner[n] >= 0);
  const threat = id => enemyN(id).reduce((a, n) => a + Math.max(0, s.troops[n] - 1), 0);
  return { s, me, enemyN, threat, mine: () => g.owned(me) };
}

// Zielregion: klein, schon teilweise besetzt, wenig Gegnertruppen; Missionsregionen bevorzugt
function targetCont(g, c) {
  const { s, me } = c;
  const mission = g.cur().mission;
  let best = null, bestScore = -1;
  for (const [cont, info] of Object.entries(g.map.continents)) {
    const ts = g.contTerritories(cont); if (!ts.length) continue;
    const mineN = ts.filter(id => s.owner[id] === me).length;
    if (mineN === ts.length) continue;
    const enemyTroops = ts.filter(id => s.owner[id] !== me).reduce((a, id) => a + s.troops[id], 0);
    const myTroops = ts.filter(id => s.owner[id] === me).reduce((a, id) => a + s.troops[id], 0);
    let score = (mineN / ts.length + 0.1) * (info.bonus + 1) * (myTroops + 3) / (enemyTroops + ts.length * 1.5);
    if (mission?.kind === 'kontinente' && mission.conts.includes(cont)) score *= 2.5;
    if (score > bestScore) { bestScore = score; best = cont; }
  }
  return best;
}

function* reinforce(g, L, c) {
  const { s, me, enemyN, threat } = c;
  // Karten
  for (let k = 0; k < 4; k++) {
    const sets = g.sets(me);
    if (!sets.length) break;
    if (s.mustTrade || L.tradeEarly || g.cur().cards.length >= 4) { const r = g.trade(sets[0].idx); yield { type: 'trade', val: r.val, bonusOn: r.bonusOn }; }
    else break;
  }
  if (s.mustTrade) return; // sollte nicht vorkommen
  const mine = c.mine();
  const borders = mine.filter(id => enemyN(id).length);
  if (!borders.length) { while (s.reinforcements > 0) { const id = mine[rnd(mine.length)]; const n = g.place(id, s.reinforcements); yield { type: 'place', id, n }; } return; }

  const tc = targetCont(g, c);
  // Startpunkt für den Angriff auf die Zielregion
  const inTarget = id => g.contOf(id) === tc;
  let launch = borders.filter(id => enemyN(id).some(inTarget));
  if (!launch.length) launch = borders;
  launch.sort((a, b) => (s.troops[b] - threat(b) * 0.3) - (s.troops[a] - threat(a) * 0.3));
  const main = Math.random() < L.focus ? launch[0] : launch[rnd(launch.length)];

  // Verteidigung: Grenzen eigener Regionen, die stark bedroht sind
  const ownedConts = Object.keys(g.map.continents).filter(k => g.ownsCont(me, k));
  const defend = borders.filter(id => ownedConts.includes(g.contOf(id)) && threat(id) > s.troops[id])
    .sort((a, b) => (threat(b) - s.troops[b]) - (threat(a) - s.troops[a]));

  let defShare = defend.length ? Math.ceil(s.reinforcements * L.def) : 0;
  for (const id of defend) {
    if (defShare <= 0) break;
    const need = Math.min(defShare, Math.max(1, threat(id) - s.troops[id] + 1));
    const n = g.place(id, need); defShare -= n; if (n) yield { type: 'place', id, n };
  }
  if (s.reinforcements > 0) { const n = g.place(main, s.reinforcements); yield { type: 'place', id: main, n }; }
}

function scoreAttack(g, c, from, to, tc, L) {
  const { s, me } = c;
  const a = s.troops[from] - 1, d = s.troops[to];
  const ratio = a / d;
  let v = ratio;
  const cont = g.contOf(to);
  if (cont === tc) v += 1.2;
  // macht die Region komplett?
  const ts = g.contTerritories(cont);
  const missing = ts.filter(id => s.owner[id] !== me).length;
  if (missing === 1) v += 2.5;
  // bricht gegnerischen Regionsbonus
  const defOwner = s.owner[to];
  if (g.ownsCont(defOwner, cont)) v += 1.5;
  // Vernichtung (Karten erbeuten)
  const defLeft = g.owned(defOwner).length;
  if (defLeft <= 2 && !s.players[defOwner].barb) v += 2.5;
  const mission = g.cur().mission;
  if (mission?.kind === 'vernichte' && mission.target === defOwner) v += 1.5;
  if (s.settings.mode === 'hauptstadt' && Object.values(s.capitals).includes(to)) v += 2;
  return { v, ratio };
}

function* attack(g, L, c) {
  const { s, me, enemyN, threat } = c;
  const tc = targetCont(g, c);
  const total = pi => g.owned(pi).reduce((a, id) => a + s.troops[id], 0);
  const ownedConts = () => Object.keys(g.map.continents).filter(k => g.ownsCont(me, k));
  for (let k = 0; k < L.maxAttacks; k++) {
    // Schwer: deutlich überlegen? Dann härter nachsetzen
    const strongest = Math.max(...s.players.filter(p => p.alive && p.idx !== me && !p.barb).map(p => total(p.idx)), 1);
    const ratioNow = L.smart && total(me) > strongest * 1.6 ? 1.0 : L.ratio;
    const oc = L.smart ? ownedConts() : [];
    if (s.phase !== 'attack') return;
    let best = null;
    for (const from of c.mine()) {
      if (s.troops[from] < 2) continue;
      for (const to of g.targets(from)) {
        const sc = scoreAttack(g, c, from, to, tc, L);
        // noch keine Karte diesen Zug: etwas mutiger
        const need = g.cur().conqueredThisTurn ? ratioNow : Math.min(ratioNow, 1.0);
        if (sc.ratio < need || s.troops[from] < 3 && s.troops[to] > 1) continue;
        // Schwer: Grenzwache eigener Regionen nicht leer räumen
        if (L.guard && oc.includes(g.contOf(from)) && g.contOf(to) !== g.contOf(from) &&
            s.troops[from] - 1 - s.troops[to] < threat(from) * 0.6) continue;
        // Geduldig: nur Karte holen, Region schließen, Gegner vernichten, gegnerischen Bonus brechen,
        // bis die eigene Armee klar überlegen ist; dann alles nach vorn
        if (L.patient && !(total(me) > strongest * L.patient)) {
          const defOwner = s.owner[to], cont = g.contOf(to);
          const useful = !g.cur().conqueredThisTurn || cont === tc || g.ownsCont(defOwner, cont) ||
            g.owned(defOwner).length <= 2 || g.contTerritories(cont).filter(id => s.owner[id] !== me).length === 1;
          if (!useful) continue;
        }
        if (!best || sc.v > best.v) best = { from, to, ...sc };
      }
    }
    if (!best) return;
    const { from, to } = best;
    // würfeln, solange die Lage gut bleibt
    let res;
    while (g.canAttack(from, to) && s.troops[from] > 1 && (s.troops[from] - 1) >= s.troops[to] * L.chase) {
      res = g.roll(from, to);
      yield { type: 'roll', res };
      if (res.conquered) break;
    }
    if (res?.conquered) {
      const m = s.pendingMove;
      const toBorder = enemyN(to).length > 0, fromBorder = enemyN(from).length > 0;
      let n;
      if (L.moveAll && toBorder) n = Math.max(m.min, m.max - (fromBorder ? Math.min(2, m.max) : 0));
      else if (toBorder && !fromBorder) n = m.max;
      else if (!toBorder && fromBorder) n = m.min;
      else if (toBorder && fromBorder) n = Math.max(m.min, Math.min(m.max, m.max - Math.ceil(threat(from) * 0.5)));
      else n = m.min;
      g.move(n);
      yield { type: 'move', from, to, n };
      if (s.phase === 'over') return;
      if (s.phase === 'reinforce') { // Pflichteintausch nach Vernichtung
        yield* reinforce(g, L, c);
        g.toAttack();
      }
    } else if (!res) return;
  }
}

function* fortify(g, L, c) {
  const { s, me, enemyN, threat } = c;
  if (!g.toFortify()) return;
  const mine = c.mine();
  const interior = mine.filter(id => !enemyN(id).length && s.troops[id] > 1).sort((a, b) => s.troops[b] - s.troops[a]);
  for (const from of interior) {
    const reach = g.reachable(from).filter(id => enemyN(id).length);
    if (!reach.length) continue;
    reach.sort((a, b) => (threat(b) - s.troops[b]) - (threat(a) - s.troops[a]));
    const to = L === LEVEL.leicht ? reach[rnd(reach.length)] : reach[0];
    const n = s.troops[from] - 1;
    if (g.fortify(from, to, n)) { yield { type: 'fortify', from, to, n }; return; }
  }
}

function* barbarianTurn(g) {
  const s = g.s, me = s.turn;
  const mine = g.owned(me);
  const front = mine.filter(id => g.adj(id).some(n => s.owner[n] !== me && s.owner[n] >= 0));
  const pool = front.length ? front : mine;
  while (s.reinforcements > 0 && pool.length) { const id = pool[rnd(pool.length)]; const n = g.place(id, 1); yield { type: 'place', id, n }; }
  g.toAttack();
  for (let k = 0; k < 10; k++) {
    let best = null;
    for (const from of g.owned(me)) for (const to of g.targets(from)) {
      if (s.troops[from] - 1 <= s.troops[to]) continue;
      const v = s.troops[from] / s.troops[to] + Math.random();
      if (!best || v > best.v) best = { from, to, v };
    }
    if (!best) break;
    let res;
    while (g.canAttack(best.from, best.to) && s.troops[best.from] > 1) { res = g.roll(best.from, best.to); yield { type: 'roll', res }; if (res.conquered) break; }
    if (res?.conquered) { g.move(s.pendingMove.max); yield { type: 'move', from: best.from, to: best.to }; if (s.phase === 'over') return; }
  }
}

export function* botTurn(g) {
  const p = g.cur();
  if (p.barb) { yield* barbarianTurn(g); return; }
  const L = LEVEL[p.bot] || LEVEL.mittel;
  const c = ctx(g);
  yield* reinforce(g, L, c);
  g.toAttack();
  yield* attack(g, L, c);
  if (g.s.phase === 'over') return;
  yield* fortify(g, L, c);
}
