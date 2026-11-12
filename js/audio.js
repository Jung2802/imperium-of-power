// Geräusche, live erzeugt (keine Audiodateien): Kriegstrommel, Klingen, Horn.
let ctx = null, master = null, on = true;
try { on = localStorage.getItem('imp.ton') !== 'aus'; } catch {}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    ctx = new C(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function noise(dur) {
  const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const n = ctx.createBufferSource(); n.buffer = b; return n;
}

export const sound = {
  get on() { return on; },
  toggle() { on = !on; try { localStorage.setItem('imp.ton', on ? 'an' : 'aus'); } catch {} return on; },
  drum(t0 = 0, vol = 1) {
    if (!on || !ac()) return; const t = ctx.currentTime + t0;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.62);
    const n = noise(0.12), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 900; ng.gain.setValueAtTime(0.35 * vol, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(f).connect(ng).connect(master); n.start(t);
  },
  march() { this.drum(0, 1); this.drum(0.32, 0.7); this.drum(0.64, 1.1); },
  clash(vol = 0.5) {
    if (!on || !ac()) return; const t = ctx.currentTime;
    const n = noise(0.25), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 3200 + Math.random() * 1800; f.Q.value = 9;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.connect(f).connect(g).connect(master); n.start(t);
  },
  horn() {
    if (!on || !ac()) return; const t = ctx.currentTime;
    [[98, 0, 0.5], [147, 0.42, 0.8]].forEach(([fr, d, len]) => {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = fr; f.type = 'lowpass'; f.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
      o.connect(f).connect(g).connect(master); o.start(t + d); o.stop(t + d + len + 0.05);
    });
  },
  tick() {
    if (!on || !ac()) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 520;
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.07);
  },
};
