// Controlador de la campaña: bucle, controles, interfaz, guardado.
import { FORMS, FORM_ORDER, FUTURE, ZONES, SPECIES, MEMORY_DISCOUNT, MAX_EGGS } from './data.js';
import { World, dist2, clamp } from './sim.js';
import { Renderer } from './render.js';
import { Snd } from './audio.js';

/* ---------- Guardado ---------- */
const KEY = 'ciclo-primordial-v1';
const fresh = () => ({ v: 1, started: false, form: 'ameba', adn: 0, memory: ['ameba'], eggs: 0, stats: { kills: 0, deaths: 0, time: 0, evos: 0 }, chapterDone: false, muted: false, hints: {} });
let SAVE = fresh();
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.v === 1) SAVE = Object.assign(fresh(), s); } catch (e) { /* sin almacenamiento */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(SAVE)); } catch (e) { /* sin almacenamiento */ } };

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const ME = 'me';
const world = new World();
const R = new Renderer($('cv'));
const G = { mode: 'menu', paused: false, deathT: -1, cause: '', victoryShown: false, saveT: 5, hudT: 0, menuT: 0, dyn: null };
window.__game = { world, G, get SAVE() { return SAVE; } };
// para pruebas automáticas: un paso de simulación igual al del bucle
function simStep(v) {
  world.step(STEP_, { [ME]: { mx: v.x, my: v.y, ability: INP.ability, multiply: INP.multiply } });
  INP.ability = false; INP.multiply = false; handleEvents(); SAVE.stats.time += STEP_;
}
const STEP_ = 1 / 60;

/* ---------- Avisos ---------- */
function toast(msg, kind = '') {
  const box = $('toasts'); if (box.children.length >= 3) box.firstChild.remove();
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = msg; box.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 320); }, 3400);
}
function hintOnce(key, msg, kind) { if (SAVE.hints[key]) return; SAVE.hints[key] = 1; toast(msg, kind); }

/* ---------- Costos ---------- */
const me = () => world.players[ME];
function evoCost(form) { const F = FORMS[form]; if (!F.next) return 0; return Math.round(F.evoCost * (SAVE.memory.includes(F.next) ? MEMORY_DISCOUNT : 1)); }
const myEggs = () => world.eggs.filter(g => g.owner === ME);

/* ---------- Partida ---------- */
function startGame(newRun) {
  if (newRun) { const keep = { muted: SAVE.muted }; SAVE = fresh(); Object.assign(SAVE, keep); }
  SAVE.started = true; save();
  world.loadZone(FORMS[SAVE.form].zone); world.players = {};
  const p = world.addPlayer(ME, SAVE.form, SAVE.adn);
  for (let i = 0; i < Math.min(SAVE.eggs, MAX_EGGS); i++) { const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 200; world.eggs.push({ id: 1e6 + i, owner: ME, form: SAVE.form, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: Math.max(6, FORMS[SAVE.form].r * 0.45), hp: FORMS[SAVE.form].hp * 0.25, t: 0, seed: Math.random() * 10 }); }
  R.cam.x = p.x; R.cam.y = p.y; R.cam.s = R.targetScale(p);
  G.mode = 'play'; G.deathT = -1; G.victoryShown = SAVE.chapterDone;
  $('ov-menu').hidden = true; $('hud').hidden = false; buildHud();
  if (newRun) showIntro(); else toast(`${ZONES[world.zone.id].name} · ${FORMS[p.form].name}`);
}
function toMenu() {
  syncSave(); G.mode = 'menu'; closeDyn(); $('hud').hidden = true; $('ov-menu').hidden = false; world.players = {}; world.loadZone('charca'); refreshMenu();
}
function refreshMenu() {
  $('m-cont').hidden = !SAVE.started;
  $('m-meta').textContent = SAVE.started ? `${FORMS[SAVE.form].name} · ${SAVE.memory.length} formas recordadas · ${Math.floor(SAVE.stats.time / 60)} min` : '';
  $('m-sound').textContent = `Sonido: ${SAVE.muted ? 'no' : 'sí'}`;
}
function syncSave() {
  const p = me(); if (!p) return;
  if (!p.dead) { SAVE.form = p.form; SAVE.adn = p.adn; }
  SAVE.eggs = myEggs().length; save();
}

/* ---------- Evolucionar, multiplicarse, renacer ---------- */
function doEvolve() {
  const p = me(); if (!p || p.dead) return;
  const F = FORMS[p.form]; if (!F.next) return;
  const cost = evoCost(p.form); if (p.adn < cost) { toast(`Te faltan ${Math.ceil(cost - p.adn)} ADN para evolucionar`, 'warn'); Snd.play('deny'); return; }
  const next = F.next, N = FORMS[next], firstTime = !SAVE.memory.includes(next);
  const lostEggs = myEggs().length;
  const adn = p.adn - cost;
  if (N.zone !== world.zone.id) { world.loadZone(N.zone); world.players = {}; world.addPlayer(ME, next, adn); const q = me(); R.cam.x = q.x; R.cam.y = q.y; }
  else { world.eggs = world.eggs.filter(g => g.owner !== ME); p.form = next; p.adn = adn; world.applyForm(p, true); }
  if (!SAVE.memory.includes(next)) SAVE.memory.push(next);
  SAVE.stats.evos++; SAVE.form = next; SAVE.adn = adn; SAVE.eggs = 0; save();
  Snd.play('evolve'); const q = me(); R.burst(q.x, q.y, N.color, 30, q.r * 1.5);
  closeDyn(); buildHud();
  toast(`Ahora eres: ${N.name}`, 'good');
  if (lostEggs) setTimeout(() => toast('Tus huevos anteriores eclosionaron y siguen su propio camino', ''), 900);
  if (firstTime) setTimeout(() => { const q = me(); if (q && q.form === next && G.mode === 'play') toast(N.hint, 'dna'); }, 1800);
}
function doMultiply() { if (G.mode === 'play' && !G.paused) INP.multiply = true; }
function respawn() {
  const p = me(); closeDyn();
  const eggs = myEggs();
  if (eggs.length) {
    const g = eggs[eggs.length - 1]; world.eggs = world.eggs.filter(x => x !== g);
    p.form = g.form; p.adn = p.adn * 0.7; world.applyForm(p, true); world.placePlayer(p, { x: g.x, y: g.y });
    toast('Naciste de uno de tus huevos', 'good');
  } else {
    if (world.zone.id !== 'charca') { world.loadZone('charca'); world.players = {}; world.addPlayer(ME, 'ameba', 0); }
    else { const wasAmeba = p.form === 'ameba'; p.form = 'ameba'; p.adn = wasAmeba ? p.adn * 0.5 : 0; world.applyForm(p, true); world.placePlayer(p); }
    toast('Vuelves a ser una ameba. Pero recuerdas el camino…', 'dna');
  }
  const q = me(); R.cam.x = q.x; R.cam.y = q.y; G.deathT = -1; syncSave(); buildHud();
}

/* ---------- Pantallas ---------- */
function openDyn(kind, html, wide, closable = true) {
  G.dyn = { kind, closable }; const s = $('dyn'); s.className = 'sheet' + (wide ? ' wide' : ''); s.innerHTML = html; $('ov-dyn').hidden = false; G.paused = true;
}
function closeDyn() { $('ov-dyn').hidden = true; G.dyn = null; G.paused = false; }
const head = (title, closable = true) => `<div class="shead"><h2>${title}</h2>${closable ? '<button class="x" type="button" data-act="close" aria-label="Cerrar">×</button>' : ''}</div>`;
$('ov-dyn').addEventListener('click', e => {
  if (e.target === e.currentTarget && G.dyn && G.dyn.closable) { closeDyn(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; Snd.play('click');
  const a = b.dataset.act;
  if (a === 'close') closeDyn();
  else if (a === 'evolve') doEvolve();
  else if (a === 'respawn') respawn();
  else if (a === 'wake') { closeDyn(); toast(FORMS.ameba.hint, 'dna'); }
  else if (a === 'tree') showTree();
  else if (a === 'menu') toMenu();
  else if (a === 'sound') { SAVE.muted = !SAVE.muted; Snd.setMuted(SAVE.muted); save(); b.textContent = `Sonido: ${SAVE.muted ? 'no' : 'sí'}`; }
  else if (a === 'reset') { b.outerHTML = '<button class="btn danger" type="button" data-act="reset2">Sí, borrar todo</button>'; }
  else if (a === 'reset2') { const m = SAVE.muted; SAVE = fresh(); SAVE.muted = m; save(); toMenu(); }
});
function showIntro() {
  openDyn('intro', head('Despiertas', false) + `<div class="sbody">
    <p class="story">Bajo un Árbol inmenso hay una caverna. Todo lo que muere en el mundo de arriba <em>renace aquí abajo</em>, y todo lo que muere aquí abajo alimenta al Árbol.</p>
    <p>Acabas de despertar como una <strong>ameba</strong>. Para salir tendrás que evolucionar, forma tras forma, hasta encontrar la <strong>Grieta de luz</strong>.</p>
    <div class="chain"><div class="g"><b>Verde: presa</b>Está por debajo de ti en la cadena. Cómetela.</div><div class="y"><b>Amarillo: igual</b>Tu mismo nivel. Si peleáis, gana el más fuerte.</div><div class="r"><b>Rojo: depredador</b>Te come a ti. Huye.</div></div>
    <p>Con el ADN que ganas comiendo eliges: <strong>evolucionar</strong> a una forma nueva o <strong>multiplicarte</strong> para dejar huevos. Si mueres, renaces en tu último huevo; si no te queda ninguno, vuelves a ser ameba, pero <strong>recuerdas el camino</strong> y evolucionar de nuevo te cuesta menos.</p>
    <p>Cuidado: cuantas más muertes hay, más se agita el Árbol, y sus raíces golpean desde arriba.</p>
    <div class="row end"><button class="btn primary" type="button" data-act="wake">Despertar</button></div></div>`, false, false);
}
function treeHtml(p) {
  const cur = p.form, idx = FORM_ORDER.indexOf(cur);
  const node = id => {
    const F = FORMS[id], i = FORM_ORDER.indexOf(id); let cls = 'node', tag = 'Por descubrir';
    if (id === cur) { cls += ' cur'; tag = 'Eres esto'; }
    else if (i === idx + 1) { cls += ' next'; tag = SAVE.memory.includes(id) ? 'Siguiente · recordada' : 'Siguiente'; }
    else if (SAVE.memory.includes(id)) { cls += ' mem'; tag = 'Recordada'; }
    else cls += ' lock';
    return `<div class="${cls}"><small>Nivel ${F.tier} · ${esc(tag)}</small><b>${esc(F.name)}</b></div>`;
  };
  const fut = b => FUTURE.filter(f => f.branch === b).map(f => `<div class="node lock"><small>Próximamente</small><b>${esc(f.name)}</b></div>`).join('');
  return `<div class="lifetree"><p class="branch-h">Tronco y rama esqueleto</p><div class="trunk">${FORM_ORDER.map(node).join('')}</div>
    <div class="lt-row"><div><p class="branch-h">Rama exoesqueleto (desde el gusano)</p><div class="trunk">${fut('exo')}</div></div>
    <div><p class="branch-h">Después del pez con mandíbula</p><div class="trunk">${fut('esq')}</div></div></div></div>`;
}
function showTree() {
  const p = me(); if (!p) return;
  const F = FORMS[p.form];
  let card = '';
  if (F.next) {
    const N = FORMS[F.next], cost = evoCost(p.form), full = F.evoCost, can = p.adn >= cost;
    card = `<div class="card"><small class="cost">Siguiente forma · ${cost < full ? `<s>${full}</s> ` : ''}${cost} ADN${cost < full ? ' (la recuerdas)' : ''}</small><h3>${esc(N.name)}</h3>
      <div class="pc"><div class="pro"><small>Ventaja</small>${esc(N.pros)}</div><div class="con"><small>Defecto</small>${esc(N.cons)}</div></div>
      <p>Pasas a ser nivel ${N.tier} de la cadena: lo que era tu igual pasa a ser tu presa.${ZONES[N.zone].name !== ZONES[F.zone].name ? ` Te mudarás a: <strong>${esc(ZONES[N.zone].name)}</strong>.` : ''} Tus huevos actuales eclosionarán y seguirán su camino.</p>
      <div class="row end">${can ? '<button class="btn primary" type="button" data-act="evolve">Evolucionar</button>' : `<span class="cost">Te faltan ${Math.ceil(cost - p.adn)} ADN. Come más.</span>`}</div></div>`;
  } else card = `<div class="card"><h3>Estás en la cima de este capítulo</h3><p>Vence al Acorazado y cruza la Grieta de luz. Las siguientes formas llegarán en el capítulo 2.</p></div>`;
  openDyn('tree', head('Árbol de la vida') + `<div class="sbody">${card}${treeHtml(p)}</div>`, true);
}
function showPause() {
  openDyn('pause', head('Pausa') + `<div class="sbody">
    <p>Eres <strong>${esc(FORMS[me().form].name)}</strong> en ${esc(ZONES[world.zone.id].name)}. Llevas ${Math.floor(SAVE.stats.time / 60)} min, ${SAVE.stats.kills} presas, ${SAVE.stats.deaths} muertes y ${SAVE.memory.length} formas recordadas.</p>
    <div class="row"><button class="btn primary" type="button" data-act="close">Continuar</button><button class="btn" type="button" data-act="tree">Árbol de la vida</button><button class="btn ghost" type="button" data-act="sound">Sonido: ${SAVE.muted ? 'no' : 'sí'}</button></div>
    <p><strong>Controles.</strong> Muévete con el mouse, WASD o arrastrando el dedo. Espacio o clic: habilidad. R: multiplicarte. F: árbol de la vida y evolucionar. P o Esc: pausa.</p>
    <div class="row"><button class="btn ghost" type="button" data-act="menu">Menú principal</button><button class="btn danger" type="button" data-act="reset">Borrar progreso</button></div></div>`);
}
function showDeath() {
  const eggs = myEggs().length;
  const mem = SAVE.memory.filter(f => f !== 'ameba').map(f => FORMS[f].name);
  openDyn('death', head('Fuiste devorado', false) + `<div class="sbody"><p><strong>${esc(G.cause)}.</strong> Tu muerte alimentó al Árbol.</p>
    ${eggs ? `<p>Te quedan <strong>${eggs} huevo${eggs > 1 ? 's' : ''}</strong>. Renacerás en el más reciente, con la misma forma y el 70% de tu ADN.</p>`
      : `<p>No te quedan huevos. Vuelves a empezar como <strong>ameba</strong>.${mem.length ? ` Pero recuerdas: <strong>${esc(mem.join(', '))}</strong>. Volver a evolucionar a esas formas te costará solo el ${Math.round(MEMORY_DISCOUNT * 100)}% del ADN.` : ''}</p>`}
    <div class="row end"><button class="btn primary" type="button" data-act="respawn">Renacer</button></div></div>`, false, false);
}
function showVictory() {
  SAVE.chapterDone = true; save(); G.victoryShown = true;
  const s = SAVE.stats;
  openDyn('victory', head('Saliste de la caverna') + `<div class="sbody">
    <p class="story">La Grieta de luz te deja pasar. Del otro lado el agua es poca, el aire quema… y la orilla te espera.</p>
    <div class="stats"><div class="stat"><b>${Math.floor(s.time / 60)} min</b><small>Tiempo</small></div><div class="stat"><b>${s.kills}</b><small>Presas</small></div><div class="stat"><b>${s.deaths}</b><small>Muertes</small></div><div class="stat"><b>${s.evos}</b><small>Evoluciones</small></div></div>
    <p><strong>Capítulo 2, próximamente:</strong> el pez con patas, la orilla y la primera bifurcación del árbol de la vida.</p>
    <div class="row end"><button class="btn ghost" type="button" data-act="menu">Menú principal</button><button class="btn primary" type="button" data-act="close">Seguir nadando</button></div></div>`, true);
}

/* ---------- HUD ---------- */
function buildHud() {
  const p = me(); if (!p) return; const F = FORMS[p.form];
  $('h-form').textContent = F.name; $('h-tier').textContent = `Nivel ${F.tier}`; $('h-tier').title = `Nivel ${F.tier} de la cadena alimenticia`;
  $('t-mult').textContent = F.verb; $('m-en').hidden = p.form !== 'pezCon';
  $('btn-evo').hidden = !F.next;
  $('t-ab').innerHTML = `${esc(F.abilityName)}<small>Espacio</small>`;
}
function tickHud() {
  const p = me(); if (!p) return; const F = FORMS[p.form];
  $('b-hp').style.transform = `scaleX(${Math.max(0, p.hp / p.hpMax)})`; $('t-hp').textContent = `${Math.ceil(Math.max(0, p.hp))}/${Math.round(p.hpMax)}`;
  const cost = evoCost(p.form);
  if (F.next) { $('b-adn').style.transform = `scaleX(${clamp(p.adn / cost, 0, 1)})`; $('t-adn').textContent = `${Math.floor(p.adn)}/${cost}`; }
  else { $('b-adn').style.transform = `scaleX(${clamp(p.adn / 400, 0, 1)})`; $('t-adn').textContent = `${Math.floor(p.adn)}`; }
  if (p.form === 'pezCon') { $('b-en').style.transform = `scaleX(${p.energy / 100})`; $('t-en').textContent = `${Math.floor(p.energy)}`; }
  $('b-ira').style.transform = `scaleX(${world.ira / 100})`;
  const n = myEggs().length; let eh = '<span style="border:0;width:auto;height:auto">Huevos</span>'; for (let i = 0; i < MAX_EGGS; i++) eh += `<span class="${i < n ? 'on' : ''}"></span>`; $('h-eggs').innerHTML = eh;
  $('c-mult').textContent = `${F.multCost} ADN · tecla R`; $('btn-mult').classList.toggle('ready', p.adn >= F.multCost && n < MAX_EGGS);
  if (F.next) { $('c-evo').textContent = `${cost} ADN · tecla F`; $('btn-evo').classList.toggle('ready', p.adn >= cost); }
  const ab = $('btn-ab'), k = Math.max(0, p.cd / F.cd); ab.style.setProperty('--cd', `${k * 360}deg`); ab.classList.toggle('ready', k <= 0); ab.classList.toggle('on', !!(p.buried || p.latch));
  if (p.form === 'pezCon' && p.energy < 25) ab.classList.remove('ready');
}

/* ---------- Eventos de la simulación ---------- */
function handleEvents() {
  for (const ev of world.events) {
    R.onEvent(ev, world);
    const mine = ev.pid === ME;
    switch (ev.type) {
      case 'eat': if (mine) { Snd.play('eat'); SAVE.stats.kills++; if (ev.sp === 'paramecio' || ev.sp === 'amebaL') hintOnce('firstEat', '¡Bien! Cuando tengas suficiente ADN, pulsa Evolucionar', 'good'); } break;
      case 'food': if (mine) Snd.play('food'); break;
      case 'crunch': Snd.play('crunch'); break;
      case 'lunge': case 'bite': Snd.play('lunge'); break;
      case 'bury': case 'unbury': Snd.play('bury'); break;
      case 'latch': Snd.play('latch'); hintOnce('latch', 'Le estás chupando la vida. Pulsa otra vez para soltarte', 'dna'); break;
      case 'shaken': toast('Te sacudió y te soltaste', 'warn'); break;
      case 'noLatch': toast('Acércate más a algo de tu tamaño o más grande', 'warn'); Snd.play('deny'); break;
      case 'noEnergy': toast('Sin energía: espera a que se recargue', 'warn'); Snd.play('deny'); break;
      case 'egg': if (mine) { Snd.play('egg'); hintOnce('egg', 'Si mueres, renaces en tu huevo. Escóndelo bien: los cazadores se lo comen', 'good'); } break;
      case 'eggLost': if (ev.pid === ME) { Snd.play('eggLost'); toast('Perdiste uno de tus huevos', 'danger'); } break;
      case 'eggFull': toast(`Ya tienes ${MAX_EGGS} huevos`, 'warn'); Snd.play('deny'); break;
      case 'noAdn': toast(`Necesitas ${ev.need} ADN`, 'warn'); Snd.play('deny'); break;
      case 'strikeWarn': Snd.play('warn'); hintOnce('strike', '¡Una raíz del Árbol va a golpear! Sal del círculo ámbar', 'sap'); break;
      case 'strike': Snd.play('strike'); break;
      case 'bossWind': Snd.play('bossWind'); break;
      case 'bossDown': Snd.play('bossDown'); toast('¡Venciste al Acorazado! La Grieta de luz se abrió', 'good'); break;
      case 'playerDied': if (mine) { Snd.play('die'); SAVE.stats.deaths++; G.deathT = 1.3; G.cause = ev.cause; syncSave(); } break;
    }
  }
  world.events.length = 0;
}

/* ---------- Entrada ---------- */
const IN = { keys: {}, mx: 0, my: 0, mouse: false, joy: null };
const INP = { ability: false, multiply: false };
function inputVec() {
  let x = 0, y = 0; const k = IN.keys;
  if (k.KeyW || k.ArrowUp) y--; if (k.KeyS || k.ArrowDown) y++; if (k.KeyA || k.ArrowLeft) x--; if (k.KeyD || k.ArrowRight) x++;
  if (x || y) { const m = Math.hypot(x, y); return { x: x / m, y: y / m }; }
  if (IN.joy) { const dx = IN.joy.x - IN.joy.ox, dy = IN.joy.y - IN.joy.oy, d = Math.hypot(dx, dy); if (d < 6) return { x: 0, y: 0 }; const m = Math.min(1, d / 60); return { x: dx / d * m, y: dy / d * m }; }
  if (IN.mouse) { const sx = IN.mx - R.vw / 2, sy = IN.my - R.vh / 2, d = Math.hypot(sx, sy); if (d < 14) return { x: 0, y: 0 }; const m = Math.min(1, d / 150); return { x: sx / d * m, y: sy / d * m }; }
  return { x: 0, y: 0 };
}
function onKey(e, down) {
  const code = e.code;
  const move = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  if ((move.includes(code) || code === 'Space') && G.mode === 'play') e.preventDefault();
  IN.keys[code] = down; if (down && move.includes(code)) IN.mouse = false;
  if (!down || e.repeat) return;
  if (code === 'Escape' && G.dyn && G.dyn.closable) { closeDyn(); return; }
  if (G.mode !== 'play' || G.dyn) return;
  if (code === 'Space') INP.ability = true;
  if (code === 'KeyR') doMultiply();
  if (code === 'KeyF') showTree();
  if (code === 'KeyP' || code === 'Escape') showPause();
}
window.addEventListener('keydown', e => onKey(e, true));
window.addEventListener('keyup', e => onKey(e, false));
window.addEventListener('blur', () => { IN.keys = {}; IN.joy = null; });
const cv = $('cv');
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  Snd.init(SAVE.muted);
  if (G.mode !== 'play' || G.paused) return;
  if (e.pointerType === 'mouse') { IN.mouse = true; IN.mx = e.clientX; IN.my = e.clientY; if (e.button === 0) INP.ability = true; return; }
  IN.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
});
cv.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { if (Math.abs(e.clientX - IN.mx) + Math.abs(e.clientY - IN.my) > 3) IN.mouse = true; IN.mx = e.clientX; IN.my = e.clientY; }
  if (IN.joy && e.pointerId === IN.joy.id) { IN.joy.x = e.clientX; IN.joy.y = e.clientY; }
});
const endJoy = e => { if (IN.joy && e.pointerId === IN.joy.id) IN.joy = null; };
cv.addEventListener('pointerup', endJoy); cv.addEventListener('pointercancel', endJoy);
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') IN.mouse = false; });
$('btn-ab').addEventListener('pointerdown', e => { e.preventDefault(); Snd.init(SAVE.muted); if (G.mode === 'play' && !G.paused) INP.ability = true; });
$('btn-mult').addEventListener('click', () => doMultiply());
$('btn-evo').addEventListener('click', () => { Snd.play('click'); showTree(); });
$('btn-tree').addEventListener('click', () => { Snd.play('click'); showTree(); });
$('btn-pause').addEventListener('click', () => { Snd.play('click'); showPause(); });
$('m-new').addEventListener('click', () => {
  Snd.init(SAVE.muted); Snd.play('click');
  if (SAVE.started && !$('m-new').dataset.sure) { $('m-new').dataset.sure = '1'; $('m-new').textContent = '¿Seguro? Se borra tu partida'; return; }
  delete $('m-new').dataset.sure; $('m-new').textContent = 'Nueva partida'; startGame(true);
});
$('m-cont').addEventListener('click', () => { Snd.init(SAVE.muted); Snd.play('click'); startGame(false); });
$('m-sound').addEventListener('click', () => { Snd.init(SAVE.muted); SAVE.muted = !SAVE.muted; Snd.setMuted(SAVE.muted); save(); refreshMenu(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { syncSave(); IN.keys = {}; IN.joy = null; if (G.mode === 'play' && !G.dyn && !G.paused) showPause(); } });
window.addEventListener('pagehide', syncSave);
window.addEventListener('resize', () => R.resize());

/* ---------- Bucle ---------- */
const STEP = 1 / 60; let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  try {
    if (G.mode === 'play') {
      if (!G.paused) {
        acc += dt;
        while (acc >= STEP) {
          simStep(inputVec()); acc -= STEP;
        }
        const p = me();
        if (G.deathT > 0) { G.deathT -= dt; if (G.deathT <= 0) showDeath(); }
        if (p && !p.dead && p.form === 'pezCon' && world.crackOpen && !G.victoryShown && dist2(p.x, p.y, world.zone.crack.x, world.zone.crack.y) < (world.zone.crack.r + p.r) ** 2) showVictory();
        if (p && !p.dead && p.form === 'pezCon' && !world.crackOpen) hintOnce('boss', 'El Acorazado custodia la Grieta de luz. Muérdelo con embestidas y esquiva sus cargas', 'sap');
        G.saveT -= dt; if (G.saveT <= 0) { G.saveT = 6; syncSave(); }
      } else acc = 0;
      const p = me(); R.follow(p && !p.dead ? p : null, dt);
      R.render(world, p, G.paused ? 0 : dt);
      if (IN.joy) { const c = R.c, j = IN.joy, dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy), k = d > 60 ? 60 / d : 1; c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2; c.beginPath(); c.arc(j.ox, j.oy, 60, 0, Math.PI * 2); c.stroke(); c.fillStyle = 'rgba(255,255,255,0.2)'; c.beginPath(); c.arc(j.ox + dx * k, j.oy + dy * k, 24, 0, Math.PI * 2); c.fill(); }
      G.hudT -= dt; if (G.hudT <= 0) { G.hudT = 0.1; tickHud(); }
    } else {
      // menú: la caverna viva de fondo
      G.menuT += dt; world.step(Math.min(dt, 0.05), {}); world.events.length = 0;
      R.cam.x = Math.cos(G.menuT * 0.05) * 500; R.cam.y = Math.sin(G.menuT * 0.035) * 400; R.cam.s = R.targetScale(null) * Math.min(R.vw, R.vh) / 700; R.viewR = Math.hypot(R.vw, R.vh) / 2 / R.cam.s;
      R.render(world, null, dt);
    }
  } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
R.resize(); world.loadZone('charca'); refreshMenu();
Object.assign(window.__game, { simStep, INP, doEvolve, respawn, closeDyn, evoCost, showTree, startGame, toMenu });
requestAnimationFrame(frame);
