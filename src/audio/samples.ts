import type { Hit, Score } from '../notation/model';
import { SAMPLE_BANK, type SampleKey } from './sample-manifest';

/**
 * Recorded drum samples (see CREDITS.md). Files are fetched and decoded on demand; until a sound
 * is ready, or if it can't be loaded at all, the caller falls back to the synthesized voice.
 */

interface Take {
  buffer: AudioBuffer;
  /** Where the hit starts in the decoded buffer, skipping codec priming. */
  offset: number;
}

interface Layer {
  vel: number;
  takes: Take[];
}

interface SampleVoice {
  key: SampleKey;
  src: AudioBufferSourceNode;
  gain: GainNode;
  start: number;
}

/** Played most often, so loaded first (and their bytes prefetched before any audio starts). */
const CORE: SampleKey[] = ['kick', 'snare', 'hihat-closed'];
/** Overlapping hits of one sound beyond this fade the oldest out. */
const MAX_VOICES = 4;
export const HAT_RINGING: SampleKey[] = ['hihat-open', 'hihat-half'];

const CHOKES: Partial<Record<SampleKey, SampleKey>> = {
  crash: 'crash-choke',
  china: 'china-choke',
  ride: 'ride-choke',
  'ride-bell': 'ride-choke',
};

let ctx: AudioContext | null = null;
let bus: GainNode;
const layers = new Map<SampleKey, Layer[]>();
const loading = new Map<SampleKey, Promise<boolean>>();
const bytes = new Map<string, Promise<ArrayBuffer>>();
const roundRobin = new Map<SampleKey, number>();
let voices: SampleVoice[] = [];

const preferred: 'ogg' | 'm4a' = (() => {
  try {
    return new Audio().canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'm4a';
  } catch {
    return 'm4a';
  }
})();

function url(name: string, ext: string) {
  return new URL(`${import.meta.env.BASE_URL}samples/${name}.${ext}`, document.baseURI).href;
}

function fetchBytes(name: string, ext: string) {
  const id = `${name}.${ext}`;
  let p = bytes.get(id);
  if (!p) {
    p = fetch(url(name, ext)).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${id}`);
      return r.arrayBuffer();
    });
    p.catch(() => bytes.delete(id));
    bytes.set(id, p);
  }
  return p;
}

/** Index of the first sample above 2% of the peak, less 1 ms. */
function onset(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const floor = peak * 0.02;
  let i = 0;
  while (i < data.length && Math.abs(data[i]) < floor) i++;
  return Math.max(0, i / buffer.sampleRate - 0.001);
}

async function decode(name: string, ext: string): Promise<Take> {
  const data = await fetchBytes(name, ext);
  bytes.delete(`${name}.${ext}`); // decodeAudioData detaches the buffer
  const buffer = await ctx!.decodeAudioData(data);
  return { buffer, offset: onset(buffer) };
}

async function loadTake(name: string): Promise<Take> {
  const data = await fetchBytes(name, preferred);
  bytes.delete(`${name}.${preferred}`); // decodeAudioData detaches the buffer
  try {
    const buffer = await ctx!.decodeAudioData(data);
    return { buffer, offset: onset(buffer) };
  } catch (err) {
    // Claimed Opus support but can't decode it: try the AAC copy.
    if (preferred === 'm4a') throw err;
    return decode(name, 'm4a');
  }
}

function loadKey(key: SampleKey): Promise<boolean> {
  let p = loading.get(key);
  if (!p) {
    p = Promise.all(
      SAMPLE_BANK[key].map(async (l) => ({ vel: l.vel, takes: await Promise.all(l.files.map(loadTake)) })),
    ).then(
      (ls) => {
        layers.set(key, ls);
        return true;
      },
      (err) => {
        console.warn(`Drum sample "${key}" unavailable, using the synthesized sound.`, err);
        return false;
      },
    );
    loading.set(key, p);
  }
  return p;
}

/** Fetches the most-used sample files while idle, without creating an AudioContext. */
export function prefetchSamples() {
  const run = () => {
    for (const key of CORE) for (const l of SAMPLE_BANK[key]) for (const f of l.files) void fetchBytes(f, preferred).catch(() => {});
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1000);
}

/** Called once the AudioContext exists (after a user gesture): loads every sound, most-used first. */
export function initSamples(ac: AudioContext, dest: AudioNode) {
  ctx = ac;
  bus = ac.createGain();
  bus.gain.value = 0.9;
  bus.connect(dest);
  void Promise.all(CORE.map(loadKey)).then(() => {
    for (const key of Object.keys(SAMPLE_BANK) as SampleKey[]) void loadKey(key);
  });
}

/** Resolves once the given sounds are loaded (or failed), or after timeoutMs, whichever comes first. */
export function ensureSamples(keys: Iterable<SampleKey>, timeoutMs = 2000): Promise<void> {
  if (!ctx) return Promise.resolve();
  const all = Promise.all([...new Set(keys)].map(loadKey)).then(() => {});
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

export function sampleKeyFor(hit: Hit): SampleKey {
  const m = hit.mods;
  switch (hit.inst) {
    case 'snare':
      return m.includes('crossStick') ? 'sidestick' : m.includes('rimshot') ? 'rimshot' : 'snare';
    case 'tom1':
      return 'tom-high';
    case 'tom2':
      return 'tom-mid';
    case 'floorTom':
      return 'tom-floor';
    case 'hihat':
      return m.includes('open') ? 'hihat-open' : m.includes('halfOpen') ? 'hihat-half' : 'hihat-closed';
    case 'hihatFoot':
      return 'hihat-foot';
    case 'rideBell':
      return 'ride-bell';
    default:
      return hit.inst;
  }
}

export function chokeKeyFor(key: SampleKey): SampleKey | undefined {
  return CHOKES[key];
}

/** Every sound a score needs. */
export function scoreSampleKeys(score: Score): Set<SampleKey> {
  const keys = new Set<SampleKey>();
  for (const m of score.measures) {
    for (const hits of m.hits.values()) {
      for (const hit of hits) {
        const key = sampleKeyFor(hit);
        keys.add(key);
        const choke = chokeKeyFor(key);
        if (choke && hit.mods.includes('choke')) keys.add(choke);
      }
    }
  }
  return keys;
}

function fadeOut(voice: SampleVoice, t: number, timeConstant: number) {
  voice.gain.gain.cancelScheduledValues(t);
  voice.gain.gain.setTargetAtTime(0, t, timeConstant);
  voice.src.stop(t + timeConstant * 8);
}

/** Damps any of the given sounds that started before t (hi-hat closing, a hand grabbing a cymbal). */
export function chokeSamples(keys: SampleKey[], t: number, timeConstant = 0.015) {
  voices = voices.filter((v) => {
    if (v.start >= t || !keys.includes(v.key)) return true;
    fadeOut(v, t, timeConstant);
    return false;
  });
}

/** Plays a sample at velocity v (0.2 ghost … 1.15 marcato). Returns false if the sound isn't loaded yet. */
export function playSample(key: SampleKey, t: number, v: number): boolean {
  const ls = layers.get(key);
  if (!ctx || !ls) {
    if (ctx) void loadKey(key);
    return false;
  }
  let layer = ls[0];
  for (const l of ls) if (Math.abs(l.vel - v) < Math.abs(layer.vel - v)) layer = l;
  const n = roundRobin.get(key) ?? 0;
  roundRobin.set(key, n + 1);
  const take = layer.takes[n % layer.takes.length];

  const same = voices.filter((x) => x.key === key && x.start <= t);
  if (same.length >= MAX_VOICES) {
    const oldest = same[0];
    fadeOut(oldest, t, 0.03);
    voices = voices.filter((x) => x !== oldest);
  }

  const gain = ctx.createGain();
  gain.gain.value = Math.min(1.3, Math.max(0.35, v / layer.vel));
  const src = ctx.createBufferSource();
  src.buffer = take.buffer;
  src.connect(gain).connect(bus);
  src.start(t, take.offset);
  const voice: SampleVoice = { key, src, gain, start: t };
  voices.push(voice);
  src.onended = () => {
    voices = voices.filter((x) => x !== voice);
    gain.disconnect();
  };
  return true;
}
