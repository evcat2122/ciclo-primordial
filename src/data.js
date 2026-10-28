// Datos del juego: formas jugables, especies, zonas. Sin lógica.
export const TAU = Math.PI * 2;

/* Formas que puede tomar el jugador (rama esqueleto del árbol animal) */
export const FORMS = {
  ameba: {
    name: 'Ameba', zone: 'charca', tier: 1, r: 14, speed: 125, hp: 70, bite: 16,
    next: 'gusano', evoCost: 150, multCost: 40,
    ability: 'pseudopodo', abilityName: 'Pseudópodo', cd: 2.2,
    color: '#7ff3d6', verb: 'Dividirte',
    pros: 'Envuelve y digiere todo lo que es más pequeño que ella',
    cons: 'Es lenta y blanda: casi todo puede comérsela',
    hint: 'Toca lo que brilla en verde para envolverlo. Pseudópodo: un estirón rápido.',
  },
  gusano: {
    name: 'Gusano', zone: 'lodo', tier: 2, r: 12, speed: 150, hp: 120, bite: 26,
    next: 'pezSin', evoCost: 400, multCost: 90,
    ability: 'enterrarse', abilityName: 'Enterrarse', cd: 0.6,
    color: '#ff9f7a', verb: 'Poner huevos',
    pros: 'Primera boca de verdad. Se entierra en el lodo y desaparece',
    cons: 'Enterrado no ve casi nada y no puede comer',
    hint: 'Enterrarse te esconde de los depredadores. Vuelve a pulsar para salir.',
  },
  pezSin: {
    name: 'Pez sin mandíbula', zone: 'lago', tier: 3, r: 22, speed: 240, hp: 230, bite: 22,
    next: 'pezCon', evoCost: 700, multCost: 170,
    ability: 'adherirse', abilityName: 'Adherirse', cd: 0.8,
    color: '#8fc7ff', verb: 'Desovar',
    pros: 'Rápido. Se pega a presas más grandes y les chupa la vida',
    cons: 'No tiene mandíbula: muerde muy débil',
    hint: 'Acércate a algo más grande y pulsa Adherirse para chuparle la vida.',
  },
  pezCon: {
    name: 'Pez con mandíbula', zone: 'lago', tier: 4, r: 30, speed: 250, hp: 300, bite: 60,
    next: null, evoCost: 0, multCost: 260,
    ability: 'mordisco', abilityName: 'Mordisco', cd: 0.5,
    color: '#ffd166', verb: 'Desovar',
    pros: 'Muerde de verdad: lo que antes te cazaba ahora es tu presa',
    cons: 'Cada mordisco gasta energía; sin energía eres lento',
    hint: 'Mordisco: embestida que hace mucho daño. Vence al Acorazado y cruza la Grieta de luz.',
  },
};
export const FORM_ORDER = ['ameba', 'gusano', 'pezSin', 'pezCon'];

/* Formas futuras que se muestran en el árbol de la vida como "próximamente" */
export const FUTURE = [
  { id: 'crustaceo', name: 'Crustáceo', branch: 'exo', after: 'gusano' },
  { id: 'arana', name: 'Araña', branch: 'exo', after: 'crustaceo' },
  { id: 'escorpion', name: 'Escorpión', branch: 'exo', after: 'crustaceo' },
  { id: 'alado', name: 'Alado', branch: 'exo', after: 'crustaceo' },
  { id: 'pezPatas', name: 'Pez con patas', branch: 'esq', after: 'pezCon' },
  { id: 'reptil', name: 'Reptil', branch: 'esq', after: 'pezPatas' },
  { id: 'ave', name: 'Ave', branch: 'esq', after: 'pezPatas' },
  { id: 'simio', name: 'Simio', branch: 'esq', after: 'pezPatas' },
];

/* Zonas de la caverna */
export const ZONES = {
  charca: { name: 'Charca del fondo', R: 1200, food: 260, foodR: [2.5, 4.5], foodV: 0.55, bg: ['#06161a', '#020608'], glow: '#3ff2d0', rocks: 6, pop: 48, seed: 11 },
  lodo:   { name: 'Lodo de las raíces', R: 1600, food: 300, foodR: [3, 5.5], foodV: 1.1, bg: ['#150f0a', '#050302'], glow: '#ffb067', rocks: 8, pop: 52, seed: 23 },
  lago:   { name: 'Lago subterráneo', R: 2600, food: 380, foodR: [4, 7], foodV: 2, bg: ['#071028', '#01030a'], glow: '#6aa8ff', rocks: 10, pop: 62, seed: 37 },
};

/* Especies. tier = nivel en la cadena alimenticia (0 = alimento). adn = lo que da al comerla */
export const SPECIES = {
  // Charca
  paramecio: { name: 'Paramecio', zone: 'charca', tier: 1, r: [8, 12], speed: 150, hp: 30, bite: 6, adn: 7, ai: 'grazer', shape: 'paramecio', color: '#b8f7a0', w: 10, desc: 'Rápido y nervioso. Huye de todo.' },
  amebaR:    { name: 'Ameba rival', zone: 'charca', tier: 1, r: [11, 17], speed: 95, hp: 55, bite: 12, adn: 10, ai: 'hunter', shape: 'blob', color: '#c7a6ff', w: 4, desc: 'Compite contigo por la comida. Del mismo nivel.' },
  rotifero:  { name: 'Rotífero', zone: 'charca', tier: 2, r: [18, 24], speed: 100, hp: 120, bite: 24, adn: 24, ai: 'vortex', shape: 'rotifero', color: '#ff7a9c', w: 1.6, desc: 'Su corona de cilios crea un remolino que traga lo pequeño.' },
  hidra:     { name: 'Hidra', zone: 'charca', tier: 2, r: [16, 20], speed: 0, hp: 140, bite: 22, adn: 26, ai: 'sessile', shape: 'hidra', color: '#ffb067', w: 1.5, desc: 'Inmóvil. Sus tentáculos urticantes atrapan a quien pasa.' },
  // Lodo
  amebaL:    { name: 'Ameba del lodo', zone: 'lodo', tier: 1, r: [9, 14], speed: 80, hp: 40, bite: 8, adn: 9, ai: 'grazer', shape: 'blob', color: '#9fe0c9', w: 9, desc: 'Antes era tu igual. Ahora es comida.' },
  nematodo:  { name: 'Nematodo', zone: 'lodo', tier: 2, r: [9, 12], speed: 135, hp: 90, bite: 18, adn: 18, ai: 'hunter', shape: 'worm', color: '#ffd9a8', w: 6, desc: 'Otro gusano: pelea por el mismo alimento.' },
  planaria:  { name: 'Planaria', zone: 'lodo', tier: 2, r: [12, 16], speed: 90, hp: 110, bite: 16, adn: 20, ai: 'grazer', shape: 'planaria', color: '#e0b3ff', w: 5, desc: 'Gusano plano y bizco. Se regenera.' },
  trilobite: { name: 'Trilobite', zone: 'lodo', tier: 3, r: [20, 28], speed: 105, hp: 220, bite: 34, adn: 40, ai: 'hunter', shape: 'trilobite', color: '#ffcf70', w: 1.5, desc: 'Acorazado y paciente. Escarba el lodo buscando gusanos.' },
  // Lago
  gusanoN:   { name: 'Gusano nadador', zone: 'lago', tier: 2, r: [12, 16], speed: 140, hp: 70, bite: 12, adn: 14, ai: 'grazer', shape: 'worm', color: '#ff9f7a', w: 8, desc: 'Lo que fuiste. Ahora, un bocado.' },
  medusa:    { name: 'Medusa luminosa', zone: 'lago', tier: 3, r: [22, 32], speed: 50, hp: 150, bite: 26, adn: 30, ai: 'drift', shape: 'medusa', color: '#7ff3ff', w: 5, desc: 'Flota sin rumbo. Sus tentáculos pican.' },
  trilobiteL:{ name: 'Trilobite', zone: 'lago', tier: 3, r: [22, 30], speed: 95, hp: 240, bite: 30, adn: 36, ai: 'grazer', shape: 'trilobite', color: '#ffcf70', w: 5, desc: 'Escarba el fondo. Del mismo nivel que un pez sin mandíbula.' },
  euripterido:{ name: 'Euriptérido', zone: 'lago', tier: 4, r: [34, 46], speed: 175, hp: 420, bite: 60, adn: 80, ai: 'hunter', shape: 'euripterido', color: '#ff6b6b', w: 2, desc: 'Escorpión marino gigante. El terror de los peces sin mandíbula.' },
  pezRival:  { name: 'Pez acorazado menor', zone: 'lago', tier: 4, r: [28, 36], speed: 200, hp: 300, bite: 50, adn: 60, ai: 'hunter', shape: 'fish', jaw: true, color: '#c0d0ff', w: 1, desc: 'Otro pez con mandíbula. Compite por el trono del lago.' },
  acorazado: { name: 'El Acorazado', zone: 'lago', tier: 5, r: [90, 90], speed: 170, hp: 2600, bite: 90, adn: 0, ai: 'boss', shape: 'fish', jaw: true, armor: true, color: '#e0e6ff', w: 0, boss: true, desc: 'Placodermo gigante que custodia la Grieta de luz.' },
};
export const SPECIES_IDS = Object.keys(SPECIES);

export const MEMORY_DISCOUNT = 0.4;   // re-evolucionar a una forma recordada cuesta 40%
export const MAX_EGGS = 3;
