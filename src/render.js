// Dibujo de la caverna bioluminiscente. Solo lee el estado del mundo.
import { TAU, FORMS, SPECIES } from './data.js';
import { clamp, lerp, dist2, mulberry32 } from './sim.js';

const REL = { prey: '#8cff7a', peer: '#ffd166', pred: '#ff4f6d' };
const _rgb = {};
function hexRgb(h) { if (_rgb[h]) return _rgb[h]; const n = parseInt(h.slice(1), 16); return (_rgb[h] = [n >> 16 & 255, n >> 8 & 255, n & 255]); }
export function rgba(h, a) { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function shade(h, k) { const c = hexRgb(h); const f = v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)); return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`; }
const glowCache = {};
function glowSprite(hex) {
  if (glowCache[hex]) return glowCache[hex];
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, rgba(hex, 1)); gr.addColorStop(0.3, rgba(hex, 0.35)); gr.addColorStop(1, rgba(hex, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (glowCache[hex] = c);
}
function glow(c, x, y, rad, hex, a) { c.globalAlpha = a; c.drawImage(glowSprite(hex), x - rad, y - rad, rad * 2, rad * 2); c.globalAlpha = 1; }

export class Renderer {
  constructor(canvas) { this.cv = canvas; this.c = canvas.getContext('2d'); this.cam = { x: 0, y: 0, s: 1 }; this.vw = 800; this.vh = 600; this.dpr = 1; this.fx = []; this.shake = 0; this.motes = []; this.zoneCache = null; this.t = 0; }
  resize() {
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.vw * this.vh > 1.1e6 ? 1.5 : 2);
    this.cv.width = Math.round(this.vw * this.dpr); this.cv.height = Math.round(this.vh * this.dpr);
    if (!this.motes.length) for (let i = 0; i < 70; i++) this.motes.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, r: 0.6 + Math.random() * 1.8, ph: Math.random() * 10 });
    this.vig = null;
  }
  targetScale(p) {
    const dim = Math.sqrt(this.vw * this.vh), diam = clamp(0.046 * dim, 34, 54);
    if (!p) return 0.6;
    return diam / (2 * p.r) * (p.form === 'gusano' ? 0.75 : 1) * (p.buried ? 1.15 : 1);
  }
  follow(p, dt) {
    const k = 1 - Math.exp(-dt * 6);
    if (p) { this.cam.x = lerp(this.cam.x, p.x, k); this.cam.y = lerp(this.cam.y, p.y, k); }
    this.cam.s = lerp(this.cam.s, this.targetScale(p), 1 - Math.exp(-dt * 2.5));
    this.viewR = Math.hypot(this.vw, this.vh) / 2 / this.cam.s;
  }
  visible(x, y, pad) { return dist2(x, y, this.cam.x, this.cam.y) < (this.viewR + pad) ** 2; }
  w2s(x, y) { return { x: (x - this.cam.x) * this.cam.s + this.vw / 2, y: (y - this.cam.y) * this.cam.s + this.vh / 2 }; }
  s2w(x, y) { return { x: (x - this.vw / 2) / this.cam.s + this.cam.x, y: (y - this.vh / 2) / this.cam.s + this.cam.y }; }

  /* ---------- efectos ---------- */
  burst(x, y, col, n, r) { for (let i = 0; i < n && this.fx.length < 300; i++) { const a = Math.random() * TAU, s = (30 + Math.random() * 120) * (0.6 + r / 40); this.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: Math.max(1.5, r * (0.08 + Math.random() * 0.12)), c: col, t: 0, life: 0.4 + Math.random() * 0.5 }); } }
  text(x, y, txt, col) { this.fx.push({ x, y, txt, c: col, t: 0, life: 1.2, text: true }); }
  onEvent(ev, world) {
    if (ev.type === 'eat') { const S = SPECIES[ev.sp]; this.burst(ev.x, ev.y, S.color, 12, ev.r); this.text(ev.x, ev.y - ev.r, `+${Math.round(ev.adn)} ADN`, '#ff9cd6'); }
    else if (ev.type === 'death') this.burst(ev.x, ev.y, SPECIES[ev.sp].color, 8, ev.r * 0.7);
    else if (ev.type === 'strike') { this.burst(ev.x, ev.y, '#ffb067', 26, ev.r * 0.6); this.shake = 0.45; }
    else if (ev.type === 'crunch') { this.burst(ev.x, ev.y, '#ffffff', 8, 18); this.shake = Math.max(this.shake, 0.15); }
    else if (ev.type === 'egg') this.burst(ev.x, ev.y, '#ffe8a8', 10, 14);
    else if (ev.type === 'eggLost') this.burst(ev.x, ev.y, '#ff4f6d', 10, 12);
    else if (ev.type === 'playerDied') this.burst(ev.x, ev.y, '#ffffff', 30, 30);
    else if (ev.type === 'bossDown') { for (let i = 0; i < 3; i++) this.burst(ev.x, ev.y, ['#ffd166', '#ffffff', '#6aa8ff'][i], 30, 60); this.shake = 0.8; }
  }

  /* ---------- fondo: raíces del Árbol ---------- */
  drawRoots(c, world) {
    const par = 0.12, ox = -this.cam.x * this.cam.s * par, oy = -this.cam.y * this.cam.s * par;
    const W = this.vw, H = this.vh, ira = world.ira / 100;
    if (!this.roots) {
      const rng = mulberry32(5); this.roots = [];
      for (let i = 0; i < 9; i++) {
        const pts = [], x0 = rng() * 2400 - 1200; let x = x0, y = -900, w = 60 + rng() * 70;
        for (let k = 0; k < 14; k++) { pts.push({ x, y, w }); x += (rng() - 0.5) * 220; y += 120 + rng() * 80; w *= 0.88; }
        this.roots.push(pts);
      }
    }
    c.save(); c.translate(W / 2 + ox, H / 2 + oy * 0.4);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const pts of this.roots) {
      c.strokeStyle = '#140e09';
      for (let k = 1; k < pts.length; k++) { c.lineWidth = pts[k].w; c.beginPath(); c.moveTo(pts[k - 1].x, pts[k - 1].y); c.lineTo(pts[k].x, pts[k].y); c.stroke(); }
      c.strokeStyle = `rgba(255,176,103,${0.12 + 0.25 * ira + 0.06 * Math.sin(this.t * 2 + pts[0].x)})`;
      for (let k = 1; k < pts.length; k++) { c.lineWidth = Math.max(1, pts[k].w * 0.08); c.beginPath(); c.moveTo(pts[k - 1].x, pts[k - 1].y); c.lineTo(pts[k].x, pts[k].y); c.stroke(); }
    }
    c.restore();
  }

  /* ---------- principal ---------- */
  render(world, me, dt) {
    this.t += dt;
    const c = this.c, W = this.vw, H = this.vh, zn = world.zone, Z = zn.Z;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.globalAlpha = 1;
    c.fillStyle = '#030406'; c.fillRect(0, 0, W, H);
    this.drawRoots(c, world);
    let sx = 0, sy = 0; if (this.shake > 0) { this.shake -= dt; sx = (Math.random() - 0.5) * 14 * this.shake; sy = (Math.random() - 0.5) * 14 * this.shake; }
    c.save(); c.translate(W / 2 + sx, H / 2 + sy); c.scale(this.cam.s, this.cam.s); c.translate(-this.cam.x, -this.cam.y);
    this.drawZone(c, world);
    this.drawStrikes(c, world, false);
    this.drawFood(c, world);
    this.drawEggs(c, world);
    for (const e of world.ents) if (!e.dead && this.visible(e.x, e.y, e.r * 4)) this.drawEnt(c, e, me);
    for (const id in world.players) { const p = world.players[id]; if (!p.dead) this.drawPlayer(c, p, p === me); }
    this.drawStrikes(c, world, true);
    this.drawFx(c, dt);
    // brillos aditivos
    c.globalCompositeOperation = 'lighter';
    for (const f of world.food) if (this.visible(f.x, f.y, 20)) glow(c, f.x, f.y, f.r * 4, Z.glow, 0.35);
    for (const e of world.ents) if (!e.dead && this.visible(e.x, e.y, e.r * 3)) glow(c, e.x, e.y, e.r * 2.6, SPECIES[e.sp].color, e.boss ? 0.35 : 0.22);
    for (const id in world.players) { const p = world.players[id]; if (!p.dead) glow(c, p.x, p.y, p.r * (p.buried ? 2 : 3.4), FORMS[p.form].color, p.buried ? 0.15 : 0.35); }
    if (zn.crack) glow(c, zn.crack.x, zn.crack.y, zn.crack.r * (world.crackOpen ? 4 : 1.6), '#fff1c2', world.crackOpen ? 0.7 + 0.2 * Math.sin(this.t * 3) : 0.25);
    c.globalCompositeOperation = 'source-over';
    c.restore();
    this.drawMotes(c, Z);
    if (me && me.buried) this.drawBuried(c, me);
    this.drawVignette(c);
    this.drawArrows(c, world, me);
    this.drawTexts(c);
  }
  drawZone(c, world) {
    const zn = world.zone, Z = zn.Z, N = 160;
    if (!this.zoneCache || this.zoneCache.id !== zn.id) {
      const pts = []; for (let i = 0; i < N; i++) { const a = i / N * TAU, R = zn.wallR(a); pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
      const rng = mulberry32(Z.seed * 7), specks = [];
      for (let i = 0; i < 900; i++) { const a = rng() * TAU, d = Math.sqrt(rng()) * Z.R; if (d < zn.wallR(a) - 10) specks.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 1 + rng() * 3, ph: rng() * 10 }); }
      const moss = []; for (let i = 0; i < 260; i++) { const a = rng() * TAU, R = zn.wallR(a) - rng() * 30; moss.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, r: 4 + rng() * 12, ph: rng() * 10 }); }
      this.zoneCache = { id: zn.id, pts, specks, moss };
    }
    const zc = this.zoneCache;
    // roca exterior
    c.fillStyle = '#07070a'; c.beginPath(); c.rect(this.cam.x - this.viewR * 1.3, this.cam.y - this.viewR * 1.3, this.viewR * 2.6, this.viewR * 2.6);
    c.moveTo(zc.pts[0][0], zc.pts[0][1]); for (let i = zc.pts.length - 1; i >= 0; i--) c.lineTo(zc.pts[i][0], zc.pts[i][1]); c.closePath(); c.fill('evenodd');
    // agua de la caverna
    c.beginPath(); c.moveTo(zc.pts[0][0], zc.pts[0][1]); for (const p of zc.pts) c.lineTo(p[0], p[1]); c.closePath();
    const g = c.createRadialGradient(0, 0, 0, 0, 0, Z.R); g.addColorStop(0, Z.bg[0]); g.addColorStop(1, Z.bg[1]); c.fillStyle = g; c.fill();
    c.strokeStyle = rgba(Z.glow, 0.35); c.lineWidth = 4 / this.cam.s + 3; c.stroke();
    // motas del fondo
    c.fillStyle = rgba(Z.glow, 0.12);
    for (const s of zc.specks) if (this.visible(s.x, s.y, 10)) { c.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 0.8 + s.ph); c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    for (const m of zc.moss) if (this.visible(m.x, m.y, 30)) glow(c, m.x, m.y, m.r * 2.4, Z.glow, 0.25 + 0.15 * Math.sin(this.t + m.ph));
    // rocas
    for (const rk of zn.rocks) {
      if (!this.visible(rk.x, rk.y, rk.r + 40)) continue;
      c.fillStyle = '#0b0b10'; c.beginPath();
      for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, rr = rk.r * (0.9 + 0.1 * Math.sin(a * 3 + rk.seed) + 0.05 * Math.sin(a * 7 + rk.seed)); const x = rk.x + Math.cos(a) * rr, y = rk.y + Math.sin(a) * rr; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.fill(); c.strokeStyle = rgba(Z.glow, 0.25); c.lineWidth = 2; c.stroke();
      for (let k = 0; k < 5; k++) { const a = rk.seed + k * 1.3; glow(c, rk.x + Math.cos(a) * rk.r * 0.95, rk.y + Math.sin(a) * rk.r * 0.95, rk.r * 0.25, Z.glow, 0.25); }
    }
    // grieta de luz
    if (zn.crack) {
      const cr = zn.crack; c.save(); c.translate(cr.x, cr.y); c.rotate(cr.a + Math.PI / 2);
      c.fillStyle = world.crackOpen ? '#fff6d8' : '#3a3424'; c.beginPath(); c.moveTo(-cr.r * 0.5, 30); c.lineTo(-cr.r * 0.12, -10); c.lineTo(0, -cr.r * 0.9); c.lineTo(cr.r * 0.14, -12); c.lineTo(cr.r * 0.5, 30); c.closePath(); c.fill();
      if (world.crackOpen) { c.strokeStyle = 'rgba(255,241,194,0.25)'; c.lineWidth = 6; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(0, -cr.r * 0.4); c.lineTo(k * 120, cr.r * 3); c.stroke(); } }
      c.restore();
    }
  }
  drawFood(c, world) {
    const col = world.zone.Z.glow;
    for (const f of world.food) { if (!this.visible(f.x, f.y, 10)) continue; c.fillStyle = col; c.beginPath(); c.arc(f.x, f.y, f.r * (1 + 0.15 * Math.sin(f.ph * 3)), 0, TAU); c.fill(); }
  }
  drawEggs(c, world) {
    for (const g of world.eggs) {
      if (!this.visible(g.x, g.y, 30)) continue;
      const col = FORMS[g.form].color;
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + g.seed, x = g.x + Math.cos(a) * g.r * 0.6, y = g.y + Math.sin(a) * g.r * 0.6, rr = g.r * 0.7 * (1 + 0.05 * Math.sin(this.t * 2 + i));
        c.fillStyle = rgba('#fff7dc', 0.25); c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); c.strokeStyle = rgba(col, 0.7); c.lineWidth = Math.max(1, g.r * 0.08); c.stroke();
        c.fillStyle = rgba(col, 0.9); c.beginPath(); c.arc(x + rr * 0.15, y, rr * 0.3, 0, TAU); c.fill(); }
    }
  }
  drawStrikes(c, world, top) {
    for (const s of world.strikes) {
      if (!this.visible(s.x, s.y, s.r)) continue;
      if (!top && !s.hit) {
        const k = s.t / s.warn;
        c.fillStyle = `rgba(255,140,60,${0.08 + 0.12 * k})`; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill();
        c.save(); c.setLineDash([14, 10]); c.lineDashOffset = -this.t * 40; c.strokeStyle = `rgba(255,176,103,${0.5 + 0.5 * k})`; c.lineWidth = 3 / this.cam.s + 2; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.stroke(); c.restore();
        c.strokeStyle = 'rgba(255,176,103,0.8)'; c.lineWidth = 3 / this.cam.s + 2; c.beginPath(); c.arc(s.x, s.y, s.r * (1 - k), 0, TAU); c.stroke();
      }
      if (top && s.hit) {
        const k = (s.t - s.warn) / 0.8;
        c.globalAlpha = 1 - k; c.fillStyle = '#1a120a'; c.beginPath();
        for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU, rr = s.r * (0.75 + 0.15 * Math.sin(a * 5)); const x = s.x + Math.cos(a) * rr, y = s.y + Math.sin(a) * rr; i ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.fill(); c.strokeStyle = '#ffb067'; c.lineWidth = 4; c.stroke(); c.globalAlpha = 1;
      }
    }
  }

  /* ---------- criaturas ---------- */
  relColor(e, me) { if (!me) return null; if (e.tier < me.tier) return REL.prey; if (e.tier === me.tier) return REL.peer; return REL.pred; }
  drawEnt(c, e, me) {
    const S = SPECIES[e.sp];
    if (e.ai === 'vortex') { c.strokeStyle = rgba(S.color, 0.12); c.lineWidth = 2; for (let i = 0; i < 3; i++) { const k = ((this.t * 0.7 + i / 3) % 1); c.beginPath(); c.arc(e.x, e.y, e.r * 4.5 * (1 - k), 0, TAU); c.stroke(); } }
    if (e.ai === 'sessile') { c.fillStyle = rgba(S.color, 0.05); c.beginPath(); c.arc(e.x, e.y, e.r * 2.8, 0, TAU); c.fill(); }
    if (e.ai === 'boss' && e.windT > 0) { c.strokeStyle = `rgba(255,79,109,${0.4 + 0.4 * Math.sin(this.t * 30)})`; c.lineWidth = 6; c.beginPath(); c.arc(e.x, e.y, e.r * 1.35, 0, TAU); c.stroke(); }
    // anillo de la cadena alimenticia
    const rc = this.relColor(e, me);
    if (rc && !e.boss) {
      c.strokeStyle = rgba(rc, 0.55); c.lineWidth = Math.max(1.5 / this.cam.s, e.r * 0.06);
      if (rc === REL.peer) c.setLineDash([e.r * 0.4, e.r * 0.3]);
      c.beginPath(); c.arc(e.x, e.y, e.r * 1.28, 0, TAU); c.stroke(); c.setLineDash([]);
      if (rc === REL.pred) { c.beginPath(); c.arc(e.x, e.y, e.r * 1.45, 0, TAU); c.stroke(); }
    }
    this.drawCreature(c, { shape: S.shape, x: e.x, y: e.y, r: e.r, face: e.face, color: S.color, seed: e.seed, hurt: e.hurtT, jaw: S.jaw, armor: S.armor, vx: e.vx, vy: e.vy });
    if (e.hp < e.hpMax && !e.boss) { const w = e.r * 1.6, h = Math.max(2.5 / this.cam.s, e.r * 0.1), y = e.y - e.r * 1.65; c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(e.x - w / 2, y, w, h); c.fillStyle = '#ff6f8a'; c.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.hpMax), h); }
  }
  drawPlayer(c, p, isMe) {
    const F = FORMS[p.form];
    c.globalAlpha = p.buried ? 0.35 : 1;
    if (p.segs && p.segs.length && p.form === 'gusano') this.drawWorm(c, { x: p.x, y: p.y, r: p.r, face: p.face, color: F.color, segs: p.segs, hurt: p.hurtT, player: true });
    else this.drawCreature(c, { shape: p.form === 'ameba' ? 'blob' : 'fish', x: p.x, y: p.y, r: p.r, face: p.face, color: F.color, seed: 3, hurt: p.hurtT, jaw: p.form === 'pezCon', sucker: p.form === 'pezSin', vx: p.vx, vy: p.vy, player: true });
    c.globalAlpha = 1;
    if (isMe) { c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 1.5 / this.cam.s; c.beginPath(); c.arc(p.x, p.y, p.r * 1.5 + 6 / this.cam.s, 0, TAU); c.stroke(); }
    if (p.buried) { c.fillStyle = 'rgba(120,80,50,0.5)'; for (let i = 0; i < 6; i++) { const a = this.t * 0.5 + i; c.beginPath(); c.arc(p.x + Math.cos(a) * p.r * 1.2, p.y + Math.sin(a) * p.r * 1.2, p.r * 0.25, 0, TAU); c.fill(); } }
  }
  drawCreature(c, o) {
    const { x, y, r, face, color, seed = 0 } = o, t = this.t;
    c.save(); c.translate(x, y); c.rotate(face); c.lineCap = 'round'; c.lineJoin = 'round';
    const sp = Math.min(1, Math.hypot(o.vx || 0, o.vy || 0) / 200);
    switch (o.shape) {
      case 'blob': {
        c.beginPath(); const N = 16;
        for (let i = 0; i <= N; i++) { const a = i / N * TAU, rr = r * (1 + 0.08 * Math.sin(t * 2.5 + i * 1.7 + seed) + 0.05 * Math.sin(t * 4 + i * 2.9)); const xx = Math.cos(a) * rr * (1 + sp * 0.15), yy = Math.sin(a) * rr; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
        c.fillStyle = rgba(color, 0.35); c.fill(); c.strokeStyle = rgba(color, 0.9); c.lineWidth = Math.max(1, r * 0.08); c.stroke();
        c.fillStyle = rgba(color, 0.6); c.beginPath(); c.arc(-r * 0.2, r * 0.1, r * 0.3, 0, TAU); c.fill();
        break;
      }
      case 'paramecio': {
        c.fillStyle = rgba(color, 0.35); c.strokeStyle = rgba(color, 0.9); c.lineWidth = Math.max(1, r * 0.08);
        c.beginPath(); c.ellipse(0, 0, r * 1.3, r * 0.65, 0, 0, TAU); c.fill(); c.stroke();
        c.strokeStyle = rgba(color, 0.6); c.lineWidth = Math.max(0.6, r * 0.04); c.beginPath();
        for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, w = Math.sin(t * 14 + i) * 0.2; const ex = Math.cos(a) * r * 1.3, ey = Math.sin(a) * r * 0.65; c.moveTo(ex, ey); c.lineTo(ex * 1.18 + Math.cos(a + w) * 2, ey * 1.25 + Math.sin(a + w) * 2); } c.stroke();
        break;
      }
      case 'rotifero': {
        c.fillStyle = rgba(color, 0.3); c.strokeStyle = rgba(color, 0.9); c.lineWidth = Math.max(1, r * 0.07);
        c.beginPath(); c.moveTo(-r * 1.3, 0); c.quadraticCurveTo(-r * 0.4, -r * 0.7, r * 0.6, -r * 0.55); c.lineTo(r * 0.6, r * 0.55); c.quadraticCurveTo(-r * 0.4, r * 0.7, -r * 1.3, 0); c.fill(); c.stroke();
        for (const s of [-1, 1]) { c.save(); c.translate(r * 0.75, s * r * 0.35); c.rotate(t * 8 * s); c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35); } c.stroke(); c.restore(); }
        break;
      }
      case 'hidra': {
        c.rotate(-face);
        c.fillStyle = rgba(color, 0.35); c.strokeStyle = rgba(color, 0.9); c.lineWidth = Math.max(1, r * 0.08);
        c.beginPath(); c.arc(0, 0, r * 0.7, 0, TAU); c.fill(); c.stroke();
        c.strokeStyle = rgba(color, 0.7); c.lineWidth = Math.max(1, r * 0.09);
        for (let k = 0; k < 7; k++) { const a0 = k / 7 * TAU + seed; c.beginPath(); c.moveTo(Math.cos(a0) * r * 0.6, Math.sin(a0) * r * 0.6); for (let i = 1; i <= 8; i++) { const u = i / 8, a = a0 + Math.sin(t * 1.5 + u * 4 + k) * 0.35 * u, rr = r * (0.6 + u * 2.2); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.stroke(); }
        break;
      }
      case 'worm': this.drawWorm(c, { x: 0, y: 0, r: r * 0.7, face: 0, color, local: true, seed }); break;
      case 'planaria': {
        c.fillStyle = rgba(color, 0.35); c.strokeStyle = rgba(color, 0.9); c.lineWidth = Math.max(1, r * 0.07);
        c.beginPath(); c.moveTo(r * 1.2, 0); c.quadraticCurveTo(r * 1.0, -r * 0.8, r * 0.5, -r * 0.5); c.quadraticCurveTo(-r * 0.6, -r * (0.55 + 0.1 * Math.sin(t * 3)), -r * 1.4, 0); c.quadraticCurveTo(-r * 0.6, r * (0.55 + 0.1 * Math.sin(t * 3 + 1)), r * 0.5, r * 0.5); c.quadraticCurveTo(r * 1.0, r * 0.8, r * 1.2, 0); c.fill(); c.stroke();
        c.fillStyle = '#10141a'; for (const s of [-1, 1]) { c.beginPath(); c.arc(r * 0.65, s * r * 0.25, r * 0.13, 0, TAU); c.fill(); }
        c.fillStyle = '#ffffff'; for (const s of [-1, 1]) { c.beginPath(); c.arc(r * 0.68, s * r * 0.28 + s * r * 0.03, r * 0.05, 0, TAU); c.fill(); }
        break;
      }
      case 'trilobite': {
        c.fillStyle = rgba(color, 0.3); c.strokeStyle = rgba(color, 0.9); c.lineWidth = Math.max(1, r * 0.06);
        c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, TAU); c.fill(); c.stroke();
        c.beginPath(); c.arc(r * 0.55, 0, r * 0.6, -1.4, 1.4); c.stroke();
        for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * r * 0.22, -r * 0.82 * Math.sqrt(1 - (i / 4.2) ** 2)); c.lineTo(i * r * 0.22, r * 0.82 * Math.sqrt(1 - (i / 4.2) ** 2)); c.stroke(); }
        c.strokeStyle = rgba(color, 0.6); for (let i = 0; i < 6; i++) { const xx = -r * 0.6 + i * r * 0.25, w = Math.sin(t * 10 + i) * r * 0.08; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(xx, s * r * 0.8); c.lineTo(xx + w, s * r * 1.05); c.stroke(); } }
        c.fillStyle = '#10141a'; for (const s of [-1, 1]) { c.beginPath(); c.arc(r * 0.7, s * r * 0.32, r * 0.1, 0, TAU); c.fill(); }
        break;
      }
      case 'medusa': {
        c.rotate(-face - Math.PI / 2);
        const pulse = 1 + 0.08 * Math.sin(t * 3 + seed);
        c.strokeStyle = rgba(color, 0.5); c.lineWidth = Math.max(0.8, r * 0.04);
        for (let k = 0; k < 7; k++) { const x0 = (k / 6 - 0.5) * r * 1.4; c.beginPath(); c.moveTo(x0, 0); for (let i = 1; i <= 8; i++) { const u = i / 8; c.lineTo(x0 + Math.sin(t * 2 + u * 5 + k) * r * 0.2 * u, u * r * 2.2); } c.stroke(); }
        c.fillStyle = rgba(color, 0.3); c.strokeStyle = rgba(color, 0.9); c.lineWidth = Math.max(1, r * 0.06);
        c.beginPath(); c.ellipse(0, 0, r * pulse, r * 0.75 / pulse, 0, Math.PI, TAU); c.closePath(); c.fill(); c.stroke();
        break;
      }
      case 'euripterido': {
        c.fillStyle = rgba(color, 0.3); c.strokeStyle = rgba(color, 0.9); c.lineWidth = Math.max(1, r * 0.05);
        c.beginPath(); c.moveTo(r * 1.0, 0); c.quadraticCurveTo(r * 0.9, -r * 0.6, r * 0.2, -r * 0.55); c.lineTo(-r * 0.9, -r * 0.25); c.lineTo(-r * 1.6, -r * 0.08); c.lineTo(-r * 1.6, r * 0.08); c.lineTo(-r * 0.9, r * 0.25); c.lineTo(r * 0.2, r * 0.55); c.quadraticCurveTo(r * 0.9, r * 0.6, r * 1.0, 0); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(-r * 1.6, 0); c.lineTo(-r * 2.1, Math.sin(t * 3) * r * 0.15); c.stroke();
        for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-r * 0.2 - i * r * 0.17, -r * 0.48 + i * r * 0.05); c.lineTo(-r * 0.2 - i * r * 0.17, r * 0.48 - i * r * 0.05); c.stroke(); }
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(r * 0.1, s * r * 0.5); c.quadraticCurveTo(-r * 0.2, s * r * (1.1 + 0.1 * Math.sin(t * 6)), -r * 0.6, s * r * 0.9); c.stroke();
          c.beginPath(); c.moveTo(r * 0.8, s * r * 0.3); c.lineTo(r * 1.4, s * r * 0.55); c.lineTo(r * 1.55, s * r * 0.3); c.stroke(); }
        c.fillStyle = '#ff2040'; for (const s of [-1, 1]) { c.beginPath(); c.arc(r * 0.6, s * r * 0.22, r * 0.08, 0, TAU); c.fill(); }
        break;
      }
      case 'fish': {
        const wag = Math.sin(t * (6 + sp * 8) + seed) * 0.35;
        c.fillStyle = rgba(color, 0.32); c.strokeStyle = rgba(color, 0.95); c.lineWidth = Math.max(1, r * 0.06);
        // cola
        c.save(); c.translate(-r * 1.1, 0); c.rotate(wag); c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * 0.9, -r * 0.6); c.quadraticCurveTo(-r * 0.6, 0, -r * 0.9, r * 0.6); c.closePath(); c.fill(); c.stroke(); c.restore();
        // cuerpo
        c.beginPath(); c.moveTo(r * 1.25, 0); c.quadraticCurveTo(r * 0.9, -r * 0.75, -r * 0.2, -r * 0.62); c.quadraticCurveTo(-r * 1.0, -r * 0.4, -r * 1.15, 0); c.quadraticCurveTo(-r * 1.0, r * 0.4, -r * 0.2, r * 0.62); c.quadraticCurveTo(r * 0.9, r * 0.75, r * 1.25, 0); c.fill(); c.stroke();
        // aletas
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(r * 0.2, s * r * 0.55); c.quadraticCurveTo(-r * 0.1, s * r * (1.0 + 0.1 * Math.sin(t * 5)), -r * 0.4, s * r * 0.6); c.stroke(); }
        c.beginPath(); c.moveTo(-r * 0.1, -r * 0.62); c.quadraticCurveTo(-r * 0.5, -r * 1.05, -r * 0.7, -r * 0.5); c.stroke();
        if (o.armor) { c.fillStyle = rgba('#e0e6ff', 0.55); c.beginPath(); c.moveTo(r * 1.25, 0); c.quadraticCurveTo(r * 1.0, -r * 0.7, r * 0.2, -r * 0.62); c.lineTo(r * 0.2, r * 0.62); c.quadraticCurveTo(r * 1.0, r * 0.7, r * 1.25, 0); c.fill(); c.stroke();
          c.beginPath(); c.moveTo(r * 0.6, -r * 0.55); c.lineTo(r * 0.6, r * 0.55); c.stroke(); }
        // boca
        if (o.jaw) { const open = 0.15 + 0.15 * Math.abs(Math.sin(t * 4 + seed)); c.strokeStyle = shade(color, -0.4); c.lineWidth = Math.max(1.4, r * 0.09); c.beginPath(); c.moveTo(r * 1.25, -r * 0.05); c.lineTo(r * 0.75, -r * 0.05 - r * open); c.moveTo(r * 1.25, r * 0.05); c.lineTo(r * 0.75, r * 0.05 + r * open); c.stroke();
          c.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(r * (0.85 + i * 0.12), -r * 0.05 - r * open * 0.7); c.lineTo(r * (0.9 + i * 0.12), -r * 0.05); c.lineTo(r * (0.95 + i * 0.12), -r * 0.05 - r * open * 0.7); c.fill(); } }
        else if (o.sucker) { c.strokeStyle = shade(color, -0.3); c.lineWidth = Math.max(1, r * 0.08); c.beginPath(); c.arc(r * 1.22, 0, r * 0.2, 0, TAU); c.stroke(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.beginPath(); c.moveTo(r * 1.22 + Math.cos(a) * r * 0.08, Math.sin(a) * r * 0.08); c.lineTo(r * 1.22 + Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18); c.stroke(); } }
        // ojo
        c.fillStyle = o.armor ? '#ff2040' : '#f4fbfa'; c.beginPath(); c.arc(r * 0.7, -r * 0.25, r * (o.player ? 0.17 : 0.12), 0, TAU); c.fill();
        c.fillStyle = '#0b0f14'; c.beginPath(); c.arc(r * 0.74, -r * 0.25, r * (o.player ? 0.09 : 0.06), 0, TAU); c.fill();
        break;
      }
    }
    if (o.player && o.shape === 'blob') { c.fillStyle = '#f4fbfa'; for (const s of [-1, 1]) { c.beginPath(); c.arc(r * 0.4, s * r * 0.25, r * 0.2, 0, TAU); c.fill(); } c.fillStyle = '#0b0f14'; for (const s of [-1, 1]) { c.beginPath(); c.arc(r * 0.47, s * r * 0.25, r * 0.1, 0, TAU); c.fill(); } }
    if (o.hurt > 0) { c.globalAlpha = Math.min(1, o.hurt * 6) * 0.5; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.globalAlpha = 1; }
    c.restore();
  }
  drawWorm(c, o) {
    let segs = o.segs;
    if (o.local) { segs = []; for (let i = 0; i < 9; i++) segs.push({ x: -i * o.r * 0.9, y: Math.sin(this.t * 6 - i * 0.8 + (o.seed || 0)) * o.r * 0.35 }); }
    const n = segs.length;
    for (let i = n - 1; i >= 0; i--) { const s = segs[i], rr = o.r * (0.95 - 0.5 * i / n); c.fillStyle = rgba(o.color, 0.32 + (i % 2) * 0.12); c.strokeStyle = rgba(o.color, 0.85); c.lineWidth = Math.max(1, rr * 0.12); c.beginPath(); c.arc(s.x, s.y, rr, 0, TAU); c.fill(); c.stroke(); }
    const hx = o.local ? o.r * 0.6 : o.x, hy = o.local ? 0 : o.y;
    c.fillStyle = rgba(o.color, 0.5); c.strokeStyle = rgba(o.color, 1); c.lineWidth = Math.max(1, o.r * 0.12); c.beginPath(); c.arc(hx, hy, o.r * 1.05, 0, TAU); c.fill(); c.stroke();
    const f = o.local ? 0 : o.face;
    c.fillStyle = '#2a0f0a'; c.beginPath(); c.arc(hx + Math.cos(f) * o.r * 0.75, hy + Math.sin(f) * o.r * 0.75, o.r * 0.32, 0, TAU); c.fill();
    if (o.player) { c.fillStyle = '#f4fbfa'; for (const s of [-1, 1]) { const a = f + s * 0.9; c.beginPath(); c.arc(hx + Math.cos(a) * o.r * 0.55, hy + Math.sin(a) * o.r * 0.55, o.r * 0.22, 0, TAU); c.fill(); } }
    if (o.hurt > 0) { c.globalAlpha = Math.min(1, o.hurt * 6) * 0.5; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(hx, hy, o.r, 0, TAU); c.fill(); c.globalAlpha = 1; }
  }
  drawFx(c, dt) {
    for (const f of this.fx) { f.t += dt; if (f.text) { f.y -= 30 * dt / this.cam.s; continue; } f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.93; f.vy *= 0.93; c.globalAlpha = Math.max(0, 1 - f.t / f.life); c.fillStyle = f.c; c.beginPath(); c.arc(f.x, f.y, f.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1; this.fx = this.fx.filter(f => f.t < f.life);
  }
  drawTexts(c) {
    c.textAlign = 'center'; c.font = '700 13px "IBM Plex Mono", ui-monospace, monospace';
    for (const f of this.fx) { if (!f.text) continue; const p = this.w2s(f.x, f.y); c.globalAlpha = Math.max(0, 1 - f.t / f.life); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(f.txt, p.x + 1, p.y + 1); c.fillStyle = f.c; c.fillText(f.txt, p.x, p.y); }
    c.globalAlpha = 1;
  }
  drawMotes(c, Z) {
    c.fillStyle = rgba(Z.glow, 0.25);
    for (const m of this.motes) { const x = ((m.x * this.vw - this.cam.x * this.cam.s * m.z * 0.3) % this.vw + this.vw) % this.vw, y = ((m.y * this.vh - this.cam.y * this.cam.s * m.z * 0.3 + this.t * 6 * m.z) % this.vh + this.vh) % this.vh; c.globalAlpha = 0.4 + 0.4 * Math.sin(this.t + m.ph); c.beginPath(); c.arc(x, y, m.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  }
  drawBuried(c, p) {
    const s = this.w2s(p.x, p.y), R = p.r * this.cam.s * 5;
    const g = c.createRadialGradient(s.x, s.y, R * 0.4, s.x, s.y, R * 1.6); g.addColorStop(0, 'rgba(10,6,3,0)'); g.addColorStop(1, 'rgba(10,6,3,0.92)');
    c.fillStyle = g; c.fillRect(0, 0, this.vw, this.vh);
  }
  drawVignette(c) {
    if (!this.vig) { const v = document.createElement('canvas'); v.width = Math.max(2, this.vw >> 2); v.height = Math.max(2, this.vh >> 2); const g = v.getContext('2d'), cx = v.width / 2, cy = v.height / 2, R = Math.hypot(cx, cy); const gr = g.createRadialGradient(cx, cy, R * 0.45, cx, cy, R); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.85)'); g.fillStyle = gr; g.fillRect(0, 0, v.width, v.height); this.vig = v; }
    c.drawImage(this.vig, 0, 0, this.vw, this.vh);
  }
  arrow(c, wx, wy, col, label) {
    const s = this.w2s(wx, wy); if (s.x > 30 && s.x < this.vw - 30 && s.y > 30 && s.y < this.vh - 30) return;
    const cx = this.vw / 2, cy = this.vh / 2, a = Math.atan2(s.y - cy, s.x - cx), m = 50;
    const k = Math.min((this.vw / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (this.vh / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
    const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
    c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.globalAlpha = 0.65 + 0.35 * Math.sin(this.t * 5); c.beginPath(); c.moveTo(14, 0); c.lineTo(-8, -10); c.lineTo(-4, 0); c.lineTo(-8, 10); c.closePath(); c.fill(); c.restore();
    c.globalAlpha = 0.9; c.font = '700 11px "IBM Plex Mono", monospace'; c.textAlign = 'center'; c.fillStyle = col; c.fillText(label, x - Math.cos(a) * 30, y - Math.sin(a) * 30 + 4); c.globalAlpha = 1;
  }
  drawArrows(c, world, me) {
    if (!me || me.dead) return;
    for (const g of world.eggs) if (g.owner === me.id) this.arrow(c, g.x, g.y, '#ffe8a8', 'Huevo');
    if (world.zone.crack && me.form === 'pezCon') this.arrow(c, world.zone.crack.x, world.zone.crack.y, world.crackOpen ? '#fff1c2' : '#9aa4b8', world.crackOpen ? 'Salida' : 'Grieta');
    if (world.boss && me.form === 'pezCon') this.arrow(c, world.boss.x, world.boss.y, '#ff4f6d', 'Acorazado');
  }
}
