// Sonido generado con código (Web Audio). Sin archivos externos.
export const Snd = {
  ctx: null, master: null, muted: false, last: {},
  init(muted) {
    this.muted = !!muted;
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(this.ctx.destination);
      // zumbido de caverna
      const g = this.ctx.createGain(); g.gain.value = 0.04; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.connect(g); g.connect(this.master);
      for (const fr of [41.2, 61.7, 82.4]) { const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr; o.connect(f); o.start(); }
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 120; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05); },
  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, freq, q = 1) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(this.master); s.start();
  },
  play(name) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime, gap = { food: 0.06, hurt: 0.2, crunch: 0.08 }[name] || 0.03;
    if (this.last[name] && now - this.last[name] < gap) return; this.last[name] = now;
    try {
      switch (name) {
        case 'food': this.tone('sine', 500 + Math.random() * 300, 1100 + Math.random() * 400, 0.07, 0.04); break;
        case 'eat': this.tone('sine', 260, 820, 0.14, 0.12); this.tone('triangle', 620, 1240, 0.1, 0.05, 0.05); break;
        case 'crunch': this.noise(0.09, 0.2, 700, 1.5); this.tone('square', 180, 60, 0.12, 0.05); break;
        case 'hurt': this.tone('triangle', 170, 60, 0.2, 0.1); break;
        case 'lunge': this.noise(0.16, 0.1, 1700, 0.7); break;
        case 'bury': this.noise(0.3, 0.12, 300, 0.8); break;
        case 'latch': this.tone('sine', 900, 300, 0.2, 0.07); break;
        case 'egg': [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.06, i * 0.07)); break;
        case 'eggLost': this.tone('sawtooth', 400, 120, 0.4, 0.05); break;
        case 'warn': this.tone('sine', 90, 70, 1.2, 0.12); this.noise(1.0, 0.05, 160, 0.6); break;
        case 'strike': this.noise(0.6, 0.35, 120, 0.7); this.tone('sawtooth', 70, 35, 0.6, 0.12); break;
        case 'evolve': [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.5, 0.06, i * 0.08)); break;
        case 'die': this.tone('sawtooth', 300, 40, 0.9, 0.1); this.noise(0.5, 0.1, 400); break;
        case 'bossWind': this.tone('sawtooth', 60, 110, 0.7, 0.1); break;
        case 'bossDown': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.7, 0.07, i * 0.12)); break;
        case 'click': this.tone('sine', 700, 900, 0.05, 0.04); break;
        case 'deny': this.tone('square', 220, 160, 0.12, 0.04); break;
      }
    } catch (e) { /* audio no disponible */ }
  },
};
