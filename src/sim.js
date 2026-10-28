// Simulación pura (sin DOM). Pensada para correr en el anfitrión de una partida online:
// el mundo avanza con step(dt, inputs) y deja eventos en world.events.
import { TAU, FORMS, ZONES, SPECIES, SPECIES_IDS, MAX_EGGS } from './data.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export function angLerp(a, b, t) { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; }
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function weighted(list) { let tot = 0; for (const [, w] of list) tot += w; let r = Math.random() * tot; for (const [it, w] of list) if ((r -= w) <= 0) return it; return list[list.length - 1][0]; }

/* ---------- Geometría de la zona ---------- */
export function makeZone(id) {
  const Z = ZONES[id], rng = mulberry32(Z.seed);
  const ph = [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU];
  const wallR = th => Z.R * (0.86 + 0.07 * Math.sin(3 * th + ph[0]) + 0.04 * Math.sin(7 * th + ph[1]) + 0.025 * Math.sin(13 * th + ph[2]) + 0.012 * Math.sin(29 * th + ph[3]));
  const rocks = [];
  for (let i = 0; i < Z.rocks; i++) {
    for (let k = 0; k < 20; k++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * Z.R * 0.7, r = Z.R * (0.03 + rng() * 0.05);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (Math.hypot(x, y) < Z.R * 0.18) continue;
      if (rocks.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 80)) continue;
      rocks.push({ x, y, r, seed: rng() * 100 }); break;
    }
  }
  let crack = null;
  if (id === 'lago') { const a = rng() * TAU; const R = wallR(a); crack = { x: Math.cos(a) * (R - 40), y: Math.sin(a) * (R - 40), a, r: 120 }; }
  return { id, Z, wallR, rocks, crack, ph };
}

let nextId = 1;
const scaleOf = zid => ({ charca: 1, lodo: 1.25, lago: 2.2 }[zid]);

export class World {
  constructor() { this.t = 0; this.events = []; this.players = {}; this.ents = []; this.food = []; this.eggs = []; this.strikes = []; this.ira = 0; this.strikeT = 15; this.zone = null; this.crackOpen = false; this.boss = null; }

  /* ---------- Zonas y población ---------- */
  loadZone(zid) {
    this.zone = makeZone(zid); this.ents = []; this.food = []; this.eggs = []; this.strikes = []; this.ira = 0; this.strikeT = 18; this.crackOpen = false; this.boss = null;
    const Z = this.zone.Z;
    for (let i = 0; i < Z.food; i++) this.spawnFood();
    for (let i = 0; i < Z.pop; i++) this.spawnEnt(null, 0);
    if (zid === 'lago') { const c = this.zone.crack; const b = this.makeEnt('acorazado', c.x * 0.86, c.y * 0.86); b.home = { x: c.x * 0.8, y: c.y * 0.8 }; this.ents.push(b); this.boss = b; }
    this.events.push({ type: 'zone', zone: zid });
  }
  randomPoint(margin = 40) {
    const zn = this.zone;
    for (let k = 0; k < 30; k++) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random()) * zn.Z.R;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (d > zn.wallR(a) - margin) continue;
      if (zn.rocks.some(o => dist2(o.x, o.y, x, y) < (o.r + margin) ** 2)) continue;
      return { x, y };
    }
    return { x: 0, y: 0 };
  }
  farPoint(minD) {
    const ps = Object.values(this.players).filter(p => !p.dead);
    for (let k = 0; k < 25; k++) { const pt = this.randomPoint(60); if (ps.every(p => dist2(p.x, p.y, pt.x, pt.y) > minD * minD)) return pt; }
    return this.randomPoint(60);
  }
  spawnFood() {
    const Z = this.zone.Z, pt = this.randomPoint(20);
    this.food.push({ x: pt.x, y: pt.y, r: rand(Z.foodR[0], Z.foodR[1]), v: Z.foodV, ph: Math.random() * TAU, vx: rand(-6, 6), vy: rand(-6, 6) });
  }
  makeEnt(sp, x, y) {
    const S = SPECIES[sp], r = rand(S.r[0], S.r[1]);
    return { id: nextId++, kind: 'ent', sp, tier: S.tier, ai: S.ai, x, y, vx: 0, vy: 0, r, r0: r, hp: S.hp * (r / ((S.r[0] + S.r[1]) / 2)), hpMax: 0,
      face: rand(0, TAU), speed: S.speed, mode: 'wander', tgt: null, wx: x, wy: y, wt: 0, thinkT: Math.random() * 0.3, hurtT: 0, dead: false, seed: Math.random() * 10,
      killer: null, chargeT: 0, windT: 0, cdT: 3, home: null, eatT: 0, latched: null, boss: !!S.boss, lungeT: 0, lungeCd: rand(1, 3) };
  }
  spawnEnt(sp, minD) {
    const zid = this.zone.id;
    if (!sp) { const pool = SPECIES_IDS.filter(id => SPECIES[id].zone === zid && SPECIES[id].w > 0).map(id => [id, SPECIES[id].w]); sp = weighted(pool); }
    const pt = minD ? this.farPoint(minD) : this.randomPoint(60);
    const e = this.makeEnt(sp, pt.x, pt.y); e.hpMax = e.hp; this.ents.push(e); return e;
  }

  /* ---------- Jugadores ---------- */
  addPlayer(id, form, adn = 0) {
    const p = { id, kind: 'player', form, tier: FORMS[form].tier, x: 0, y: 0, vx: 0, vy: 0, r: FORMS[form].r, hp: 1, hpMax: 1, face: 0, adn, energy: 100,
      cd: 0, lungeT: 0, buried: false, latch: null, hurtT: 0, dead: false, lastHurt: -99, biteHit: null, segs: [], killer: null };
    this.players[id] = p; this.applyForm(p, true); this.placePlayer(p); return p;
  }
  applyForm(p, full) {
    const F = FORMS[p.form];
    p.tier = F.tier; this.updateSize(p);
    const ratio = p.hpMax > 1 ? p.hp / p.hpMax : 1;
    p.hpMax = F.hp * (p.r / F.r); p.hp = full ? p.hpMax : p.hpMax * ratio;
    p.buried = false; p.latch = null; p.energy = 100;
    if (p.form === 'gusano') { p.segs = []; for (let i = 0; i < 14; i++) p.segs.push({ x: p.x, y: p.y }); }
  }
  updateSize(p) {
    const F = FORMS[p.form], prog = F.evoCost ? clamp(p.adn / F.evoCost, 0, 1) : clamp(p.adn / 400, 0, 1);
    p.r = F.r * (1 + 0.35 * prog);
  }
  placePlayer(p, at) {
    let pt = at;
    if (!pt) { for (let k = 0; k < 30; k++) { const c = this.randomPoint(80); if (!this.boss || dist2(c.x, c.y, this.boss.x, this.boss.y) > 1600 ** 2) { if (this.ents.every(e => e.tier <= p.tier || dist2(e.x, e.y, c.x, c.y) > 350 ** 2)) { pt = c; break; } } } }
    if (!pt) pt = this.randomPoint(80);
    p.x = pt.x; p.y = pt.y; p.vx = p.vy = 0; p.dead = false;
    if (p.segs.length) for (const s of p.segs) { s.x = p.x; s.y = p.y; }
  }

  /* ---------- Paso de simulación ---------- */
  step(dt, inputs) {
    this.t += dt;
    for (const id in this.players) { const p = this.players[id]; if (!p.dead) this.updatePlayer(p, inputs[id] || {}, dt); }
    for (const e of this.ents) if (!e.dead) this.updateEnt(e, dt);
    for (const id in this.players) { const p = this.players[id]; if (!p.dead && !p.latch) this.integrate(p, dt); }
    for (const e of this.ents) if (!e.dead && e.ai !== 'sessile') this.integrate(e, dt);
    this.contacts(dt);
    this.updateFood(dt);
    this.updateEggs(dt);
    this.updateStrikes(dt);
    this.ents = this.ents.filter(e => !e.dead);
    this.maintain(dt);
  }
  integrate(o, dt) {
    o.x += o.vx * dt; o.y += o.vy * dt;
    const zn = this.zone, d = Math.hypot(o.x, o.y), a = Math.atan2(o.y, o.x), lim = zn.wallR(a) - o.r;
    if (d > lim) { o.x = Math.cos(a) * lim; o.y = Math.sin(a) * lim; const nx = Math.cos(a), ny = Math.sin(a), vd = o.vx * nx + o.vy * ny; if (vd > 0) { o.vx -= 1.5 * vd * nx; o.vy -= 1.5 * vd * ny; } o.bump = (o.bump || 0) + 1; }
    for (const rk of zn.rocks) {
      const dx = o.x - rk.x, dy = o.y - rk.y, rr = rk.r + o.r, dd = dx * dx + dy * dy;
      if (dd < rr * rr) { const dd1 = Math.sqrt(dd) || 1; o.x = rk.x + dx / dd1 * rr; o.y = rk.y + dy / dd1 * rr; const vd = (o.vx * dx + o.vy * dy) / dd1; if (vd < 0) { o.vx -= 1.5 * vd * dx / dd1; o.vy -= 1.5 * vd * dy / dd1; } o.bump = (o.bump || 0) + 1; }
    }
  }

  updatePlayer(p, inp, dt) {
    const F = FORMS[p.form];
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.cd > 0) p.cd -= dt;
    this.updateSize(p);
    p.hpMax = F.hp * (p.r / F.r);
    // regeneración fuera de combate
    if (this.t - p.lastHurt > 4) p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.03 * dt);
    if (p.form === 'pezCon') p.energy = Math.min(100, p.energy + 14 * dt);
    // movimiento
    let mx = inp.mx || 0, my = inp.my || 0; const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    let sp = F.speed * Math.pow(p.r / F.r, 0.3);
    if (p.buried) sp *= 0.45;
    if (p.form === 'pezCon' && p.energy < 20) sp *= 0.75;
    if (p.slowT > 0) { p.slowT -= dt; sp *= p.slowF; }
    if (p.latch) {
      const t = this.ents.find(e => e.id === p.latch.id);
      if (!t || t.dead) { p.latch = null; }
      else {
        p.x = t.x + Math.cos(t.face + p.latch.a) * (t.r + p.r * 0.5); p.y = t.y + Math.sin(t.face + p.latch.a) * (t.r + p.r * 0.5);
        p.face = Math.atan2(t.y - p.y, t.x - p.x); p.vx = t.vx; p.vy = t.vy;
        const drain = (t.hpMax * 0.085 + F.bite * 0.6) * dt;
        t.hp -= drain; t.hurtT = 0.1; t.killer = p; this.gainAdn(p, drain / t.hpMax * SPECIES[t.sp].adn * 1.3 + 0.0001);
        p.hp = Math.min(p.hpMax, p.hp + drain * 0.25);
        t.aggro = 3;
        if (Math.random() < (t.ai === 'boss' ? 0.9 : 0.24) * dt) { p.latch = null; this.events.push({ type: 'shaken', x: p.x, y: p.y }); p.vx = Math.cos(p.face + Math.PI) * 300; p.vy = Math.sin(p.face + Math.PI) * 300; }
        if (t.hp <= 0) this.kill(t, p);
        if (inp.ability && p.cd <= 0) { p.latch = null; p.cd = F.cd; }
        return;
      }
    }
    if (p.lungeT > 0) { p.lungeT -= dt; }
    else { const acc = Math.min(1, 6 * dt); p.vx += (mx * sp - p.vx) * acc; p.vy += (my * sp - p.vy) * acc; }
    if (Math.hypot(mx, my) > 0.1 && p.lungeT <= 0) p.face = angLerp(p.face, Math.atan2(my, mx), Math.min(1, 9 * dt));
    // habilidad
    if (inp.ability && p.cd <= 0) this.useAbility(p, mx, my);
    // multiplicarse
    if (inp.multiply) this.multiply(p);
    // segmentos del gusano
    if (p.segs.length) {
      let prev = { x: p.x, y: p.y }; const gap = p.r * 0.75;
      for (const s of p.segs) { const dx = s.x - prev.x, dy = s.y - prev.y, d = Math.hypot(dx, dy) || 1; if (d > gap) { s.x = prev.x + dx / d * gap; s.y = prev.y + dy / d * gap; } prev = s; }
    }
  }
  useAbility(p, mx, my) {
    const F = FORMS[p.form];
    const dir = Math.hypot(mx, my) > 0.2 ? Math.atan2(my, mx) : p.face;
    if (F.ability === 'pseudopodo') { p.vx = Math.cos(dir) * F.speed * 3.2; p.vy = Math.sin(dir) * F.speed * 3.2; p.lungeT = 0.25; p.face = dir; p.cd = F.cd; this.events.push({ type: 'lunge', x: p.x, y: p.y }); }
    else if (F.ability === 'enterrarse') { p.buried = !p.buried; p.cd = F.cd; this.events.push({ type: p.buried ? 'bury' : 'unbury', x: p.x, y: p.y }); }
    else if (F.ability === 'adherirse') {
      let best = null, bd = 1e12;
      for (const e of this.ents) { if (e.dead || e.tier < p.tier || e.ai === 'sessile') continue; const d = dist2(e.x, e.y, p.x, p.y), rr = e.r + p.r + 30; if (d < rr * rr && d < bd) { bd = d; best = e; } }
      if (best) { p.latch = { id: best.id, a: Math.atan2(p.y - best.y, p.x - best.x) - best.face }; p.cd = F.cd; this.events.push({ type: 'latch', x: p.x, y: p.y }); }
      else { p.cd = 0.3; this.events.push({ type: 'noLatch', pid: p.id }); }
    }
    else if (F.ability === 'mordisco') {
      if (p.energy < 25) { this.events.push({ type: 'noEnergy', pid: p.id }); p.cd = 0.3; return; }
      p.energy -= 25; p.vx = Math.cos(dir) * F.speed * 2.6; p.vy = Math.sin(dir) * F.speed * 2.6; p.lungeT = 0.28; p.face = dir; p.cd = F.cd; p.biteHit = new Set();
      this.events.push({ type: 'bite', x: p.x, y: p.y });
    }
  }
  multiply(p) {
    const F = FORMS[p.form];
    const mine = this.eggs.filter(g => g.owner === p.id);
    if (mine.length >= MAX_EGGS) { this.events.push({ type: 'eggFull', pid: p.id }); return; }
    if (p.adn < F.multCost) { this.events.push({ type: 'noAdn', pid: p.id, need: F.multCost }); return; }
    p.adn -= F.multCost;
    this.eggs.push({ id: nextId++, owner: p.id, form: p.form, x: p.x - Math.cos(p.face) * p.r * 1.5, y: p.y - Math.sin(p.face) * p.r * 1.5, r: Math.max(6, F.r * 0.45), hp: F.hp * 0.25, t: 0, seed: Math.random() * 10 });
    this.events.push({ type: 'egg', pid: p.id, x: p.x, y: p.y });
  }
  gainAdn(p, v) { p.adn += v; }
  hurt(target, amt, src) {
    if (amt <= 0 || target.dead) return;
    if (target.kind === 'player') {
      if (target.buried && !(src && src.kind === 'strike')) return;
      target.hp -= amt; target.hurtT = 0.12; target.lastHurt = this.t;
      if (target.hp <= 0) this.killPlayer(target, src);
      return;
    }
    target.hp -= amt; target.hurtT = 0.12;
    if (src && src.kind === 'player') target.killer = src;
    if (target.hp <= 0) this.kill(target, src && src.kind === 'player' ? src : target.killer);
  }
  kill(e, by) {
    if (e.dead) return; e.dead = true;
    const S = SPECIES[e.sp];
    if (by && by.kind === 'player' && !by.dead) {
      const v = S.adn * (e.r / ((S.r[0] + S.r[1]) / 2)) * (by.latch ? 0.4 : 1);
      this.gainAdn(by, v); by.hp = Math.min(by.hpMax, by.hp + by.hpMax * 0.12);
      if (!e.boss) this.ira = Math.min(100, this.ira + 1.2 + 0.6 * Math.max(0, e.tier - by.tier + 1));
      this.events.push({ type: 'eat', pid: by.id, x: e.x, y: e.y, adn: v, sp: e.sp, r: e.r });
      if (by.latch && by.latch.id === e.id) by.latch = null;
    } else this.events.push({ type: 'death', x: e.x, y: e.y, sp: e.sp, r: e.r });
    if (e.boss) { this.crackOpen = true; this.boss = null; this.events.push({ type: 'bossDown', x: e.x, y: e.y }); }
  }
  killPlayer(p, src) {
    if (p.dead) return; p.dead = true; p.hp = 0; p.latch = null; p.buried = false;
    this.ira = Math.min(100, this.ira + 6);
    let cause = 'El entorno fue demasiado hostil';
    if (src && src.kind === 'ent') cause = `${src.swallow ? 'Te tragó' : 'Te devoró'}: ${SPECIES[src.sp].name}`;
    if (src && src.kind === 'strike') cause = 'Una raíz del Árbol te aplastó';
    this.events.push({ type: 'playerDied', pid: p.id, x: p.x, y: p.y, cause });
  }

  /* ---------- IA ---------- */
  detectable(p) { return !p.dead && !p.buried; }
  think(e) {
    const S = SPECIES[e.sp], det = e.ai === 'vortex' ? 240 : 260 + e.r * 6 * (e.ai === 'boss' ? 1.4 : 1);
    e.mode = 'wander'; e.tgt = null;
    if (e.ai === 'drift') return;
    let threat = null, td = det * det;
    const consider = (o, isPlayer) => {
      if (o === e || o.dead) return;
      const d = dist2(o.x, o.y, e.x, e.y);
      if (o.tier > e.tier && d < td && (isPlayer || SPECIES[o.sp].ai !== 'sessile')) { threat = o; td = d; }
    };
    for (const id in this.players) { const p = this.players[id]; if (this.detectable(p)) consider(p, true); }
    for (const o of this.ents) consider(o, false);
    if (threat && e.ai !== 'boss') { e.mode = 'flee'; e.tgt = threat; return; }
    if (e.ai === 'hunter' || e.ai === 'vortex' || e.ai === 'boss') {
      let best = null, bd = det * det;
      for (const id in this.players) {
        const p = this.players[id]; if (!this.detectable(p) || (e.ai === 'vortex' && !(e.aggro > 0))) continue;
        if (p.tier < e.tier || (p.tier === e.tier && e.ai === 'hunter' && e.r > p.r * 1.05) || e.aggro > 0) { const d = dist2(p.x, p.y, e.x, e.y) * 0.7; if (d < bd) { bd = d; best = p; } }
      }
      if (e.ai !== 'boss') {
        for (const o of this.ents) { if (o === e || o.dead || o.sp === e.sp || o.tier >= e.tier) continue; const d = dist2(o.x, o.y, e.x, e.y); if (d < bd) { bd = d; best = o; } }
      }
      if (best) { e.mode = 'chase'; e.tgt = best; return; }
    }
    if (e.ai !== 'boss') {
      let bf = null, bd = 260 * 260;
      for (const f of this.food) { const d = dist2(f.x, f.y, e.x, e.y); if (d < bd) { bd = d; bf = f; } }
      if (bf) { e.mode = 'food'; e.tgt = bf; }
    }
  }
  pickWander(e) {
    let x, y;
    if (e.home) { const a = rand(0, TAU), d = rand(0, 500); x = e.home.x + Math.cos(a) * d; y = e.home.y + Math.sin(a) * d; }
    else { const a = rand(0, TAU), d = rand(150, 500); x = e.x + Math.cos(a) * d; y = e.y + Math.sin(a) * d; }
    const ang = Math.atan2(y, x), lim = this.zone.wallR(ang) - 80, dd = Math.hypot(x, y); if (dd > lim) { x *= lim / dd; y *= lim / dd; }
    e.wx = x; e.wy = y; e.wt = rand(3, 6);
  }
  updateEnt(e, dt) {
    const S = SPECIES[e.sp];
    if (!e.hpMax) e.hpMax = e.hp;
    if (e.hurtT > 0) e.hurtT -= dt;
    if (e.aggro > 0) e.aggro -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.ai === 'sessile') { e.vx = e.vy = 0; this.tentacles(e, dt); return; }
    e.thinkT -= dt; if (e.thinkT <= 0) { e.thinkT = 0.3 + Math.random() * 0.15; this.think(e); }
    let spd = e.speed, dx = 0, dy = 0;
    const tg = e.tgt, valid = tg && !tg.dead && !tg.eaten && !(tg.kind === 'player' && !this.detectable(tg));
    if (e.mode === 'flee' && valid) { dx = e.x - tg.x; dy = e.y - tg.y; spd *= 1.05; }
    else if ((e.mode === 'chase' || e.mode === 'food') && valid) { dx = tg.x - e.x; dy = tg.y - e.y; if (e.mode === 'food') spd *= 0.6; if (e.ai === 'vortex') spd *= 0.6; }
    else { e.mode = 'wander'; e.wt -= dt; if (e.wt <= 0 || dist2(e.x, e.y, e.wx, e.wy) < 900) this.pickWander(e); dx = e.wx - e.x; dy = e.wy - e.y; spd *= e.ai === 'drift' ? 1 : 0.45; }
    if (e.bump > 20) { this.pickWander(e); e.bump = 0; }
    if (e.ai === 'vortex') this.vortex(e, dt);
    if (e.ai === 'boss') {
      if (e.home && dist2(e.x, e.y, e.home.x, e.home.y) > 1500 ** 2 && e.mode !== 'chase') { dx = e.home.x - e.x; dy = e.home.y - e.y; }
      e.cdT -= dt;
      if (e.windT > 0) { e.windT -= dt; spd *= 0.15; if (e.windT <= 0) { e.chargeT = 0.65; const a = Math.atan2(dy, dx); e.vx = Math.cos(a) * e.speed * 3.2; e.vy = Math.sin(a) * e.speed * 3.2; e.face = a; } }
      else if (e.chargeT > 0) { e.chargeT -= dt; e.face = Math.atan2(e.vy, e.vx); return; }
      else if (e.mode === 'chase' && valid && e.cdT <= 0 && dist2(tg.x, tg.y, e.x, e.y) < 650 ** 2) { e.windT = 0.75; e.cdT = e.hp < e.hpMax * 0.5 ? 2.6 : 3.8; this.events.push({ type: 'bossWind', x: e.x, y: e.y }); }
    }
    if (e.ai === 'hunter' && e.mode === 'chase' && valid) {
      e.lungeCd -= dt;
      if (e.lungeT > 0) { e.lungeT -= dt; spd *= 1.75; }
      else if (e.lungeCd <= 0 && dist2(tg.x, tg.y, e.x, e.y) < (e.r * 3 + (tg.r || 10) * 3 + 40) ** 2) { e.lungeT = 0.45; e.lungeCd = rand(2.5, 4); }
    }
    if (e.slowT > 0) spd *= 0.5;
    const d = Math.hypot(dx, dy), a = Math.min(1, (e.lungeT > 0 ? 6 : 3) * dt);
    if (d > 0.01) { e.vx += (dx / d * spd - e.vx) * a; e.vy += (dy / d * spd - e.vy) * a; } else { e.vx *= 1 - a; e.vy *= 1 - a; }
    if (Math.hypot(e.vx, e.vy) > 5) e.face = angLerp(e.face, Math.atan2(e.vy, e.vx), Math.min(1, 6 * dt));
  }
  tentacles(e, dt) {
    const R = e.r * 2.8, S = SPECIES[e.sp];
    const affect = o => {
      if (o.dead || o.tier >= e.tier || (o.kind === 'player' && o.buried)) return;
      const d2 = dist2(o.x, o.y, e.x, e.y); if (d2 > (R + o.r) ** 2) return;
      const d = Math.sqrt(d2) || 1; o.vx += (e.x - o.x) / d * 120 * dt; o.vy += (e.y - o.y) * 120 / d * dt;
      this.hurt(o, S.bite * 0.5 * dt, e); o.slowT = 0.2; o.slowF = 0.55;
    };
    for (const id in this.players) affect(this.players[id]);
    for (const o of this.ents) if (o !== e) affect(o);
  }
  vortex(e, dt) {
    const R = e.r * 4.5, ang = e.face;
    const pull = o => {
      if (o.dead || o.tier >= e.tier || (o.kind === 'player' && (o.buried || o.dead))) return;
      const d2 = dist2(o.x, o.y, e.x, e.y); if (d2 > R * R) return;
      const d = Math.sqrt(d2) || 1, k = (1 - d / R) * 95 * dt; o.vx += (e.x - o.x) / d * k; o.vy += (e.y - o.y) / d * k;
    };
    for (const id in this.players) pull(this.players[id]);
    for (const o of this.ents) if (o !== e) pull(o);
    for (const f of this.food) { const d2 = dist2(f.x, f.y, e.x, e.y); if (d2 < R * R) { const d = Math.sqrt(d2) || 1; f.x += (e.x - f.x) / d * 60 * dt; f.y += (e.y - f.y) / d * 60 * dt; } }
  }

  /* ---------- Contactos: la cadena alimenticia ---------- */
  contacts(dt) {
    const all = [];
    for (const id in this.players) { const p = this.players[id]; if (!p.dead) all.push(p); }
    for (const e of this.ents) if (!e.dead) all.push(e);
    const n = all.length;
    for (let i = 0; i < n; i++) {
      const a = all[i]; if (a.dead) continue;
      for (let j = i + 1; j < n; j++) {
        const b = all[j]; if (b.dead) continue;
        if ((a.kind === 'player' && a.buried) || (b.kind === 'player' && b.buried)) continue;
        if (a.kind === 'player' && a.latch && a.latch.id === b.id) continue;
        if (b.kind === 'player' && b.latch && b.latch.id === a.id) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        if (dx * dx + dy * dy >= rr * rr) { if (a.kind === 'player' && a.segs.length) this.segContact(a, b, dt); else if (b.kind === 'player' && b.segs.length) this.segContact(b, a, dt); continue; }
        this.contact(a, b, Math.sqrt(dx * dx + dy * dy), dx, dy, dt);
      }
    }
  }
  segContact(p, o, dt) {
    if (o.kind !== 'ent' || o.tier <= p.tier || p.buried) return;
    for (let i = 2; i < p.segs.length; i += 2) { const s = p.segs[i]; if (dist2(s.x, s.y, o.x, o.y) < (o.r + p.r * 0.8) ** 2) { this.hurt(p, SPECIES[o.sp].bite * 0.7 * dt, o); return; } }
  }
  biteOf(o) { return o.kind === 'player' ? FORMS[o.form].bite * (o.r / FORMS[o.form].r) : SPECIES[o.sp].bite * (o.r / o.r0); }
  aggressive(o, other) {
    if (o.kind === 'player') return true;
    const ai = o.ai; if (ai === 'hunter' || ai === 'vortex' || ai === 'boss') return true;
    if (o.aggro > 0) return true;
    return false;
  }
  contact(a, b, d, dx, dy, dt) {
    if (a.kind === 'ent' && b.kind === 'ent' && a.sp === b.sp) { this.push(a, b, d, dx, dy); return; }
    let hi = a, lo = b; if (b.tier > a.tier) { hi = b; lo = a; }
    if (hi.tier > lo.tier) {
      // el de arriba come al de abajo
      const canSwallow = hi.ai !== 'boss' && lo.r < hi.r * 0.6;
      if (canSwallow && d < hi.r) { if (lo.kind === 'player') { hi.swallow = true; this.killPlayer(lo, hi); hi.swallow = false; } else this.kill(lo, hi.kind === 'player' ? hi : null); return; }
      if (this.aggressive(hi, lo) || hi.kind === 'player') {
        let dmg = this.biteOf(hi) * (hi.kind === 'player' ? 2.2 : 1.15) * dt;
        if (hi.kind === 'player' && hi.form === 'ameba') dmg *= 1.4; // envolver
        if (hi.kind === 'player' && hi.lungeT > 0 && hi.form === 'pezCon' && hi.biteHit && !hi.biteHit.has(lo.id)) { hi.biteHit.add(lo.id); dmg += this.biteOf(hi) * 1.5; this.events.push({ type: 'crunch', x: lo.x, y: lo.y }); }
        this.hurt(lo, dmg, hi);
        if (lo.kind === 'ent' && !lo.dead) { lo.slowT = 0.3; lo.aggro = 2; }
      }
      // picaduras de los de abajo
      if (!lo.dead && lo.kind === 'ent' && (lo.sp === 'medusa')) this.hurt(hi, SPECIES.medusa.bite * 0.6 * dt, lo);
    } else {
      // mismo nivel: pelea si alguno es agresivo
      const aa = this.aggressive(a, b), ba = this.aggressive(b, a);
      if (aa) this.hurt(b, this.biteOf(a) * (a.kind === 'player' ? 1.2 : 1) * dt, a);
      if (ba && !a.dead) this.hurt(a, this.biteOf(b) * dt, b);
      if (a.kind === 'player' && a.lungeT > 0 && a.form === 'pezCon' && a.biteHit && !a.biteHit.has(b.id)) { a.biteHit.add(b.id); this.hurt(b, this.biteOf(a) * 1.8, a); this.events.push({ type: 'crunch', x: b.x, y: b.y }); }
      if (b.kind === 'player' && b.lungeT > 0 && b.form === 'pezCon' && b.biteHit && !b.biteHit.has(a.id)) { b.biteHit.add(a.id); this.hurt(a, this.biteOf(b) * 1.8, b); this.events.push({ type: 'crunch', x: a.x, y: a.y }); }
    }
    // el jefe: el mordisco del pez con mandíbula sí le hace daño
    for (const [p, o] of [[a, b], [b, a]]) {
      if (p.kind === 'player' && o.ai === 'boss' && p.lungeT > 0 && p.form === 'pezCon' && p.biteHit && !p.biteHit.has(o.id)) { p.biteHit.add(o.id); this.hurt(o, this.biteOf(p) * 2.4, p); o.aggro = 5; this.events.push({ type: 'crunch', x: o.x, y: o.y }); }
    }
    if (!a.dead && !b.dead) this.push(a, b, d, dx, dy);
  }
  push(a, b, d, dx, dy) {
    const ov = a.r + b.r - d; if (ov <= 0) return;
    const nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0;
    const ma = a.ai === 'sessile' || a.ai === 'boss' ? 1e6 : a.r * a.r, mb = b.ai === 'sessile' || b.ai === 'boss' ? 1e6 : b.r * b.r, tot = ma + mb;
    a.x -= nx * ov * mb / tot; a.y -= ny * ov * mb / tot; b.x += nx * ov * ma / tot; b.y += ny * ov * ma / tot;
  }

  /* ---------- Comida, huevos, raíces ---------- */
  updateFood(dt) {
    const eaters = [];
    for (const id in this.players) { const p = this.players[id]; if (!p.dead && !p.buried) eaters.push(p); }
    for (const f of this.food) {
      f.ph += dt; f.vx += rand(-1, 1) * 10 * dt; f.vy += rand(-1, 1) * 10 * dt; f.vx *= 0.99; f.vy *= 0.99; f.x += f.vx * dt; f.y += f.vy * dt;
      for (const p of eaters) {
        const rr = p.r + f.r; if (dist2(p.x, p.y, f.x, f.y) < rr * rr) { f.eaten = true; this.gainAdn(p, f.v); p.hp = Math.min(p.hpMax, p.hp + f.v * 0.8); this.events.push({ type: 'food', pid: p.id }); break; }
      }
    }
    for (const e of this.ents) {
      if (e.dead || e.ai === 'sessile' || e.ai === 'boss' || e.mode !== 'food') continue;
      const f = e.tgt; if (!f || f.eaten) continue;
      if (dist2(e.x, e.y, f.x, f.y) < (e.r + f.r) ** 2) { f.eaten = true; e.hp = Math.min(e.hpMax, e.hp + 4); }
    }
    this.food = this.food.filter(f => !f.eaten);
  }
  updateEggs(dt) {
    for (const g of this.eggs) {
      g.t += dt;
    }
    this.eggs = this.eggs.filter(g => !g.dead);
  }
  updateStrikes(dt) {
    this.ira = Math.max(0, this.ira - 0.55 * dt);
    const ps = Object.values(this.players).filter(p => !p.dead);
    this.strikeT -= dt;
    if (this.strikeT <= 0 && ps.length) {
      this.strikeT = lerp(30, 10, this.ira / 100) * rand(0.8, 1.2);
      const p = ps[(Math.random() * ps.length) | 0], sc = scaleOf(this.zone.id);
      const onP = Math.random() < 0.35 + this.ira / 400;
      const a = rand(0, TAU), d = onP ? rand(0, 40) * sc : rand(150, 420) * sc;
      this.strikes.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: (65 + this.ira * 0.4) * sc, t: 0, warn: 1.8, hit: false });
      this.events.push({ type: 'strikeWarn' });
    }
    for (const s of this.strikes) {
      s.t += dt;
      if (!s.hit && s.t >= s.warn) {
        s.hit = true; this.events.push({ type: 'strike', x: s.x, y: s.y, r: s.r });
        const src = { kind: 'strike' };
        for (const p of ps) if (dist2(p.x, p.y, s.x, s.y) < (s.r + p.r * 0.5) ** 2) this.hurt(p, p.hpMax * 0.38, src);
        for (const e of this.ents) if (!e.dead && !e.boss && dist2(e.x, e.y, s.x, s.y) < (s.r + e.r * 0.5) ** 2) this.hurt(e, e.hpMax * 0.7, src);
        for (const g of this.eggs) if (dist2(g.x, g.y, s.x, s.y) < s.r * s.r) { g.dead = true; this.events.push({ type: 'eggLost', x: g.x, y: g.y, pid: g.owner }); }
      }
    }
    this.strikes = this.strikes.filter(s => s.t < s.warn + 0.8);
  }
  maintain(dt) {
    this.mT = (this.mT || 0) - dt; if (this.mT > 0) return; this.mT = 0.5;
    const Z = this.zone.Z;
    let tries = 0; while (this.food.length < Z.food && tries++ < 20) this.spawnFood();
    // mantener las proporciones de cada especie: rellenar la que más falta
    const zid = this.zone.id, ids = SPECIES_IDS.filter(id => SPECIES[id].zone === zid && SPECIES[id].w > 0);
    const totW = ids.reduce((a, id) => a + SPECIES[id].w, 0), cnt = {};
    for (const e of this.ents) if (!e.boss) cnt[e.sp] = (cnt[e.sp] || 0) + 1;
    let n = this.ents.filter(e => !e.boss).length;
    for (let k = 0; k < 2 && n < Z.pop; k++, n++) {
      let best = null, bd = -1e9;
      for (const id of ids) { const def = Z.pop * SPECIES[id].w / totW - (cnt[id] || 0); if (def > bd) { bd = def; best = id; } }
      this.spawnEnt(best, 700 * scaleOf(zid)); cnt[best] = (cnt[best] || 0) + 1;
    }
    // si sobran depredadores, el más lejano se va
    for (const id of ids) { const max = Math.ceil(Z.pop * SPECIES[id].w / totW * 1.4) + 1; if ((cnt[id] || 0) > max) { const ps = Object.values(this.players); const far = this.ents.filter(e => e.sp === id && ps.every(p => dist2(p.x, p.y, e.x, e.y) > 900 ** 2)); if (far.length) far[0].dead = true; } }
  }
}
