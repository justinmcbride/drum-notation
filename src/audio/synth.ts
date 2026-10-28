import type { Hit } from '../notation/model';

let ctx: AudioContext | null = null;
let out: GainNode;
let noiseBuffer: AudioBuffer;
let openHat: GainNode | null = null;
let crashGain: GainNode | null = null;

export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function envelope(t: number, peak: number, decay: number, attack = 0.002) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function noise(t: number, dur: number) {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuffer;
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
  return src;
}

function filter(type: BiquadFilterType, freq: number, q = 0.7) {
  const f = ctx!.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function osc(type: OscillatorType, t: number, dur: number, f0: number, f1?: number, glide = 0.1) {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function kick(t: number, v: number) {
  osc('sine', t, 0.5, 150, 45, 0.11).connect(envelope(t, v * 1.1, 0.45)).connect(out);
  noise(t, 0.02).connect(filter('lowpass', 2500)).connect(envelope(t, v * 0.25, 0.015)).connect(out);
}

function snare(t: number, v: number) {
  noise(t, 0.25).connect(filter('highpass', 1200)).connect(envelope(t, v * 0.65, 0.19)).connect(out);
  noise(t, 0.12).connect(filter('bandpass', 3500, 0.8)).connect(envelope(t, v * 0.3, 0.09)).connect(out);
  osc('triangle', t, 0.12, 240, 170, 0.06).connect(envelope(t, v * 0.55, 0.09)).connect(out);
}

function rimshot(t: number, v: number) {
  snare(t, v * 1.05);
  osc('square', t, 0.05, 1700).connect(filter('bandpass', 1700, 6)).connect(envelope(t, v * 0.5, 0.03)).connect(out);
  noise(t, 0.04).connect(filter('highpass', 4000)).connect(envelope(t, v * 0.4, 0.03)).connect(out);
}

function crossStick(t: number, v: number) {
  osc('triangle', t, 0.06, 1250, 900, 0.03).connect(envelope(t, v * 0.7, 0.045)).connect(out);
  noise(t, 0.04).connect(filter('bandpass', 2600, 4)).connect(envelope(t, v * 0.6, 0.03)).connect(out);
}

/** Pitch (Hz) and ring time (s) per tom: tuned a fourth apart, bigger drums ring longer. */
const TOMS = {
  tom1: { f0: 180, decay: 0.6 },
  tom2: { f0: 135, decay: 0.8 },
  floorTom: { f0: 100, decay: 1.15 },
} as const;

/** Circular-membrane overtones: [frequency ratio, level, decay scale]. */
const TOM_MODES = [
  [1, 1, 1],
  [1.59, 0.32, 0.45],
  [2.14, 0.16, 0.3],
  [2.65, 0.08, 0.2],
] as const;

function tom(t: number, v: number, { f0, decay }: { f0: number; decay: number }) {
  const ac = ctx!;
  // Harder hits stretch the head more: higher starting pitch and a brighter tone.
  const bend = 1.25 + 0.25 * Math.min(v, 1.15);
  const tone = filter('lowpass', f0 * (5 + 9 * Math.min(v, 1)), 0.5);
  tone.connect(out);

  for (const [ratio, level, decayScale] of TOM_MODES) {
    const f = f0 * ratio;
    const len = decay * decayScale;
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(f * bend, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
    o.frequency.exponentialRampToValueAtTime(f * 0.97, t + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 0.7 * level, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, len / 5);
    o.connect(g).connect(tone);
    o.start(t);
    o.stop(t + len * 1.6);
  }

  // Stick hitting the head: a few milliseconds of band-limited noise.
  noise(t, 0.02)
    .connect(filter('bandpass', Math.min(f0 * 16, 3200), 0.9))
    .connect(envelope(t, v * 0.3, 0.012, 0.001))
    .connect(out);
}

const METAL_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];

function metal(t: number, decay: number, base: number, bp: number, hp: number, peak: number) {
  const sum = ctx!.createGain();
  sum.gain.value = 0.18;
  for (const ratio of METAL_RATIOS) osc('square', t, decay, base * ratio).connect(sum);
  const env = envelope(t, peak, decay);
  sum.connect(filter('bandpass', bp, 0.9)).connect(filter('highpass', hp)).connect(env);
  return env;
}

function chokeOpenHat(t: number) {
  if (!openHat) return;
  openHat.gain.cancelScheduledValues(t);
  openHat.gain.setTargetAtTime(0.0001, t, 0.012);
  openHat = null;
}

function hihat(t: number, v: number, decay: number) {
  chokeOpenHat(t);
  const g = ctx!.createGain();
  g.connect(out);
  metal(t, decay, 40, 10000, 7000, v * 0.9).connect(g);
  noise(t, decay).connect(filter('highpass', 8000)).connect(envelope(t, v * 0.25, decay * 0.8)).connect(g);
  return g;
}

function ride(t: number, v: number) {
  metal(t, 1.4, 52, 5200, 3000, v * 0.45).connect(out);
  osc('sine', t, 1.4, 3150).connect(envelope(t, v * 0.05, 1.2)).connect(out);
  noise(t, 0.5).connect(filter('bandpass', 7000, 1.2)).connect(envelope(t, v * 0.08, 0.4)).connect(out);
}

function rideBell(t: number, v: number) {
  for (const [f, a] of [
    [740, 0.3],
    [1110, 0.22],
    [1840, 0.14],
    [2730, 0.08],
  ]) {
    osc('sine', t, 1.2, f).connect(envelope(t, v * a, 1.0)).connect(out);
  }
  metal(t, 0.6, 60, 6000, 3500, v * 0.2).connect(out);
}

function crash(t: number, v: number, decay = 1.9) {
  if (crashGain) {
    crashGain.gain.cancelScheduledValues(t);
    crashGain.gain.setTargetAtTime(0.0001, t, 0.03);
  }
  const g = ctx!.createGain();
  g.connect(out);
  metal(t, decay, 45, 7000, 3500, v * 0.5).connect(g);
  noise(t, decay).connect(filter('highpass', 3200)).connect(envelope(t, v * 0.55, decay, 0.004)).connect(g);
  crashGain = g;
}

function china(t: number, v: number) {
  metal(t, 1.3, 38, 3500, 1800, v * 0.55).connect(out);
  noise(t, 1.2).connect(filter('bandpass', 3000, 1.5)).connect(envelope(t, v * 0.5, 1.1, 0.003)).connect(out);
}

function cowbell(t: number, v: number) {
  const sum = ctx!.createGain();
  sum.gain.value = 0.4;
  osc('square', t, 0.4, 587).connect(sum);
  osc('square', t, 0.4, 845).connect(sum);
  sum.connect(filter('bandpass', 900, 2)).connect(envelope(t, v * 0.9, 0.3)).connect(out);
}

export function click(t: number, strong: boolean) {
  audioContext();
  osc('sine', t, 0.05, strong ? 1760 : 1320).connect(envelope(t, strong ? 0.35 : 0.2, 0.04)).connect(out);
}

function strike(hit: Hit, t: number, v: number) {
  const m = hit.mods;
  switch (hit.inst) {
    case 'kick':
      return kick(t, v);
    case 'snare':
      if (m.includes('crossStick')) return crossStick(t, v);
      if (m.includes('rimshot')) return rimshot(t, v);
      return snare(t, v);
    case 'tom1':
    case 'tom2':
    case 'floorTom':
      return tom(t, v, TOMS[hit.inst]);
    case 'hihat': {
      if (m.includes('open')) {
        const g = hihat(t, v, 0.6);
        openHat = g;
        return;
      }
      if (m.includes('halfOpen')) return void hihat(t, v, 0.22);
      return void hihat(t, v, 0.055);
    }
    case 'hihatFoot':
      return void hihat(t, v * 0.6, 0.045);
    case 'ride':
      return ride(t, v);
    case 'rideBell':
      return rideBell(t, v);
    case 'crash':
      return crash(t, v, m.includes('choke') ? 0.16 : 1.9);
    case 'china':
      return china(t, v);
    case 'cowbell':
      return cowbell(t, v);
  }
}

export interface HitTiming {
  /** Length of the written note, in seconds. */
  noteSec: number;
  /** Length of a sixteenth note, in seconds. */
  sixteenthSec: number;
}

export function playHit(hit: Hit, t?: number, timing: HitTiming = { noteSec: 0.5, sixteenthSec: 0.125 }) {
  const ac = audioContext();
  const when = t ?? ac.currentTime + 0.09;
  const m = hit.mods;
  let v = 0.7;
  if (m.includes('ghost')) v = 0.2;
  if (m.includes('accent')) v = 1.0;
  if (m.includes('marcato')) v = 1.15;

  if (m.includes('flam')) strike(hit, when - 0.03, v * 0.4);
  if (m.includes('drag')) {
    strike(hit, when - 0.075, v * 0.35);
    strike(hit, when - 0.04, v * 0.38);
  }
  if (m.includes('buzz')) {
    const end = when + timing.noteSec * 0.92;
    strike(hit, when, v);
    for (let s = when + 0.022; s < end; s += 0.022) strike(hit, s, v * 0.28);
    return;
  }
  if (m.includes('roll')) {
    const step = timing.sixteenthSec / 2;
    const end = when + timing.noteSec - step / 2;
    for (let s = when, i = 0; s < end; s += step, i++) strike(hit, s, i === 0 ? v : v * 0.75);
    return;
  }
  strike(hit, when, v);
}
