#!/usr/bin/env python3
"""
Builds the drum samples in public/samples/ and the manifest in src/audio/sample-manifest.ts.

Sources (downloaded on demand, cached in .sample-cache/):
  - Karoryfer "Big Rusty Drums" (CC0 1.0)
    https://github.com/sfzinstruments/karoryfer.big-rusty-drums
    Only the individual FLAC files listed below are fetched, not the whole library.
  - AVL Drumkits by Glen MacArthur (bandshed.net), CC BY-SA 3.0 — cowbell only, taken
    from the Black Pearl kit as packaged in https://github.com/x42/avldrums.lv2 (sf2/).

For every hit, the microphones are mixed to mono at the levels used by the library's default
SFZ programs (amplitude% x default CC / 127), leading silence is trimmed, the tail is cut once
it decays far enough (with a short fade), and the result is encoded twice: Ogg Opus and AAC
(.m4a, for browsers without Opus support). All Big Rusty hits share one global gain, so the
recorded dynamics between velocity layers and drums are kept.

Requires: python3, numpy, ffmpeg (with libopus). Run: python3 scripts/build-samples.py
"""

from __future__ import annotations

import struct
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.sample-cache'
OUT = ROOT / 'public' / 'samples'
MANIFEST = ROOT / 'src' / 'audio' / 'sample-manifest.ts'
SR = 44100

BRD = 'https://raw.githubusercontent.com/sfzinstruments/karoryfer.big-rusty-drums/main/Samples/'
AVL_SF2 = 'https://media.githubusercontent.com/media/x42/avldrums.lv2/master/sf2/Black_Pearl_4_LV2.sf2'

# Mic gains from Programs/02-basic.sfz (and 01-full.sfz for the China): amplitude% x default CC / 127.
KICK = {'kick': 100 / 127}
SNARE = {'btm': 100 / 127, 'top': 40 / 127, 'oh': 60 / 127}
TOM = {'cl': 100 / 127, 'oh': 70 / 127}
HAT = {'cl': 0.7 * 100 / 127, 'oh': 0.7 * 100 / 127}
RIDE = {'cl': 0.6 * 40 / 127, 'oh': 0.6 * 100 / 127}
RIDE_CHOKE = {'cl': 0.3 * 40 / 127, 'oh': 0.3 * 100 / 127}
CRASH = {'cl': 0.7 * 40 / 127, 'oh': 0.7 * 100 / 127}
CRASH_CHOKE = {'cl': 0.3 * 40 / 127, 'oh': 0.3 * 100 / 127}
CHINA = {'cl': 0.7 * 40 / 127, 'oh': 0.7 * 100 / 127}
CHINA_CHOKE = {'cl': 0.35 * 40 / 127, 'oh': 0.35 * 100 / 127}

# name: (folder, file pattern, velocity layers in the library, layers to ship, round robins, mics, max seconds)
# The pattern gets {vl} and {rr}. A layer's nominal velocity is vl / total (the top of its range).
# Toms: the library's basic kit uses 14", 15" and 18" toms, which map to high, mid and floor.
SETS: dict[str, tuple] = {
    'kick': ('kick_24/kick', 'k_vl{vl}_rr{rr}', 14, [4, 10, 14], 2, KICK, 0.9),
    'snare': ('snare_14/center', 'sn_center_vl{vl}_rr{rr}', 10, [2, 6, 10], 2, SNARE, 1.0),
    'rimshot': ('snare_14/rimshot', 'sn_rims_vl{vl}_rr{rr}', 6, [3, 6], 2, SNARE, 1.1),
    'sidestick': ('snare_14/sidestick', 'sn_ss_vl{vl}_rr{rr}', 4, [2, 4], 2, SNARE, 0.45),
    'tom-high': ('tom_14/center', 't14_vl{vl}_rr{rr}', 6, [2, 4, 6], 2, TOM, 1.8),
    'tom-mid': ('tom_15/center', 't15_vl{vl}_rr{rr}', 7, [2, 5, 7], 2, TOM, 1.8),
    'tom-floor': ('tom_18/center', 't18_vl{vl}_rr{rr}', 8, [2, 6, 8], 2, TOM, 2.2),
    'hihat-closed': ('hihat_14/tc', 'ht_tc_vl{vl}_rr{rr}', 8, [2, 6, 8], 2, HAT, 0.5),
    'hihat-half': ('hihat_14/ho', 'ht_ho_vl{vl}_rr{rr}', 4, [2, 4], 2, HAT, 1.4),
    'hihat-open': ('hihat_14/open', 'ht_open_vl{vl}_rr{rr}', 6, [3, 6], 2, HAT, 2.6),
    'hihat-foot': ('hihat_14/chik', 'ht_chik_vl{vl}_rr{rr}', 5, [3, 5], 2, HAT, 0.5),
    'ride': ('ride_22/rd', 'rd_vl{vl}_rr{rr}', 10, [3, 7, 10], 2, RIDE, 3.2),
    'ride-bell': ('ride_22/bl', 'rd_bl_vl{vl}_rr{rr}', 4, [2, 4], 1, RIDE, 3.2),
    'ride-choke': ('ride_22/choke', 'rd_ed_choke_rr{rr}', 1, [1], 1, RIDE_CHOKE, 0.8),
    'crash': ('crash_17/cr', 'cr_vl{vl}_rr{rr}', 5, [3, 5], 1, CRASH, 3.8),
    'crash-choke': ('crash_17/choke', 'cr_choke_rr{rr}', 1, [1], 2, CRASH_CHOKE, 0.7),
    'china': ('china_18/cn', 'cn_vl{vl}_rr{rr}', 5, [3, 5], 1, CHINA, 3.2),
    'china-choke': ('china_18/choke', 'cn_choke_rr{rr}', 1, [1], 1, CHINA_CHOKE, 0.7),
}

# Cowbell (AVL, CC BY-SA): SF2 sample names (soft, medium, hard) and their nominal velocities.
COWBELL = {'samples': ['56-Cowbell-01', '56-Cowbell-03', '56-Cowbell-05'], 'vels': [0.3, 0.65, 1.0], 'max': 0.6}


def fetch(url: str, dest: Path) -> Path:
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        print('  fetch', url, file=sys.stderr)
        tmp = dest.with_suffix(dest.suffix + '.part')
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(dest)
    return dest


def decode(path: Path) -> np.ndarray:
    """Decodes an audio file to mono float32 at SR (stereo overheads are averaged to mono)."""
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).mean(axis=1)


def trim(x: np.ndarray, max_sec: float, floor_db: float = -54.0) -> np.ndarray:
    peak = float(np.max(np.abs(x))) or 1.0
    # Start 2 ms before the first sample above -40 dB of the peak.
    onset = int(np.argmax(np.abs(x) > peak * 10 ** (-40 / 20)))
    x = x[max(0, onset - int(0.002 * SR)) :]
    # End where a 20 ms RMS envelope has fallen below floor_db of the peak for good, or at max_sec.
    win = int(0.02 * SR)
    env = np.sqrt(np.convolve(x * x, np.ones(win) / win, mode='same'))
    above = np.nonzero(env > peak * 10 ** (floor_db / 20))[0]
    end = min(len(x), int(max_sec * SR), int(above[-1]) + win if len(above) else len(x))
    x = x[:end].copy()
    fade = min(int(0.4 * SR), max(int(0.01 * SR), end // 4))
    x[-fade:] *= (np.cos(np.linspace(0, np.pi, fade)) + 1) / 2
    ramp = int(0.0005 * SR)
    x[:ramp] *= np.linspace(0, 1, ramp)
    return x


def sf2_samples(path: Path, names: list[str]) -> dict[str, np.ndarray]:
    """Reads named 16-bit samples out of a SoundFont 2 file."""
    d = path.read_bytes()
    chunks: dict[str, tuple[int, int]] = {}

    def walk(off: int, end: int) -> None:
        while off < end:
            cid = d[off : off + 4]
            size = struct.unpack('<I', d[off + 4 : off + 8])[0]
            if cid == b'LIST':
                walk(off + 12, off + 8 + size)
            else:
                chunks[cid.decode()] = (off + 8, size)
            off += 8 + size + (size & 1)

    walk(12, len(d))
    so, _ = chunks['smpl']
    ho, hs = chunks['shdr']
    out = {}
    for i in range(hs // 46 - 1):
        r = d[ho + i * 46 : ho + (i + 1) * 46]
        name = r[:20].split(b'\0')[0].decode('latin1')
        start, end, _, _, rate = struct.unpack('<5I', r[20:40])
        if name in names:
            assert rate == SR, rate
            out[name] = np.frombuffer(d[so + start * 2 : so + end * 2], dtype='<i2').astype(np.float32) / 32768
    return out


def encode(x: np.ndarray, name: str, opus_rate: str, aac_rate: str) -> None:
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    base = ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-map_metadata', '-1']
    opus = ['-c:a', 'libopus', '-b:a', opus_rate, '-vbr', 'on', '-application', 'audio', str(OUT / f'{name}.ogg')]
    aac = ['-c:a', 'aac', '-b:a', aac_rate, '-movflags', '+faststart', str(OUT / f'{name}.m4a')]
    subprocess.run(base + opus, input=pcm, check=True)
    subprocess.run(base + aac, input=pcm, check=True)


def peak_of(takes: list[np.ndarray]) -> float:
    return max(float(np.max(np.abs(t))) for t in takes)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('*'):
        if f.suffix in ('.ogg', '.m4a'):
            f.unlink()

    hits: dict[str, list[tuple[float, list[np.ndarray]]]] = {}
    for key, (folder, pattern, total, layers, rrs, mics, max_sec) in SETS.items():
        print(key, file=sys.stderr)
        hits[key] = []
        for vl in layers:
            takes = []
            for rr in range(1, rrs + 1):
                stem = pattern.format(vl=vl, rr=rr)
                mix = np.zeros(0, dtype=np.float32)
                for mic, gain in mics.items():
                    rel = f'{folder}/{mic}/{stem}.flac'
                    sig = decode(fetch(BRD + rel, CACHE / 'brd' / rel)) * gain
                    n = max(len(mix), len(sig))
                    mix = np.pad(mix, (0, n - len(mix))) + np.pad(sig, (0, n - len(sig)))
                takes.append(trim(mix, max_sec))
            hits[key].append((vl / total, takes))

    # One gain for the whole Big Rusty kit: the loudest hit peaks at -1 dBFS.
    kit_gain = 10 ** (-1 / 20) / max(peak_of(takes) for layers in hits.values() for _, takes in layers)

    print('cowbell', file=sys.stderr)
    cb = sf2_samples(fetch(AVL_SF2, CACHE / 'avl' / 'Black_Pearl_4_LV2.sf2'), COWBELL['samples'])
    cb_takes = [trim(cb[n], COWBELL['max']) for n in COWBELL['samples']]
    # Sit the cowbell's hardest layer at the level of the hardest sidestick (a similar short, bright click).
    cb_gain = peak_of([t for _, takes in hits['sidestick'] for t in takes]) * kit_gain / peak_of(cb_takes)

    manifest: dict[str, list[tuple[float, list[str]]]] = {}
    for key, layers in hits.items():
        washy = key.startswith(('ride', 'crash', 'china', 'hihat-open', 'hihat-half'))
        manifest[key] = []
        for li, (vel, takes) in enumerate(layers):
            names = []
            for ri, t in enumerate(takes):
                name = f'{key}-{li + 1}-{ri + 1}'
                encode(t * kit_gain, name, '56k' if washy else '48k', '80k' if washy else '64k')
                names.append(name)
            manifest[key].append((round(vel, 3), names))
    manifest['cowbell'] = []
    for li, (vel, t) in enumerate(zip(COWBELL['vels'], cb_takes)):
        name = f'cowbell-avl-{li + 1}'
        encode(t * cb_gain, name, '48k', '64k')
        manifest['cowbell'].append((vel, [name]))

    lines = [
        '// Generated by scripts/build-samples.py. Do not edit by hand.',
        '',
        '/** Velocity layers per sound: nominal velocity (0–1) and round-robin file names in public/samples/. */',
        'export const SAMPLE_BANK = {',
    ]
    for key, layers in manifest.items():
        body = ', '.join(f"{{ vel: {vel}, files: [{', '.join(repr(n) for n in names)}] }}" for vel, names in layers)
        lines.append(f"  '{key}': [{body}],")
    lines += [
        '} as const satisfies Record<string, readonly { vel: number; files: readonly string[] }[]>;',
        '',
        'export type SampleKey = keyof typeof SAMPLE_BANK;',
        '',
    ]
    MANIFEST.write_text('\n'.join(lines))

    sizes = {ext: sum(f.stat().st_size for f in OUT.glob(f'*.{ext}')) for ext in ('ogg', 'm4a')}
    count = len(list(OUT.glob('*.ogg')))
    print(f"{count} files per format; ogg {sizes['ogg'] / 1024:.0f} KiB, m4a {sizes['m4a'] / 1024:.0f} KiB", file=sys.stderr)


if __name__ == '__main__':
    main()
