#!/usr/bin/env python3
"""Compose the original ADS BOX background track (no licence needed): calm, light, positive, for speech underneath.

  python3 tools/reel/music.py OUT.mp3 [--seconds 110] [--bpm 96] [--seed 1]

Soft pads, a plucked arpeggio, round bass and a light beat over I-V-vi-IV. Different seeds/keys give variations.
"""
import argparse, os, subprocess, tempfile, wave

import numpy as np

SR = 44100


def note_hz(n):  # MIDI note number -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # one-pole filter, run twice for 12 dB/oct
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    acc = 0.0
    for i in range(len(y)):
        acc = (1 - a) * y[i] + a * acc
        y[i] = acc
    return y


def env(n, attack, release):
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    f = freq * (1 + detune)
    return 2 * ((t * f) % 1.0) - 1


def pluck(freq, n, rng, decay=0.996):
    period = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, period)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % period]
        buf[i % period] = decay * 0.5 * (buf[i % period] + buf[(i + 1) % period])
    return out * env(n, 0.002, 0.05)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--seconds", type=float, default=110)
    ap.add_argument("--bpm", type=float, default=96)
    ap.add_argument("--key", type=int, default=60)  # C
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    beat = 60 / a.bpm
    bar = 4 * beat
    total = int(a.seconds * SR)
    mix = np.zeros(total)
    k = a.key
    # I - V - vi - IV, one chord per bar (triads + added 9th on the pad for warmth)
    prog = [[0, 4, 7, 14], [7, 11, 14, 21], [9, 12, 16, 23], [5, 9, 12, 19]]
    nbars = int(a.seconds / bar) + 1
    pad = np.zeros(total); arp = np.zeros(total); bass = np.zeros(total); drums = np.zeros(total)
    for b in range(nbars):
        chord = prog[b % 4]
        s = int(b * bar * SR)
        n = min(int(bar * SR * 1.15), total - s)
        if n <= 0: break
        # Pad
        p = np.zeros(n)
        for iv in chord:
            f = note_hz(k - 12 + iv)
            p += saw(f, n, -0.004) + saw(f, n, 0.004) + 0.5 * saw(f, n, 0.0)
        pad[s:s + n] += p * env(n, 0.6, 0.7) * 0.05
        # Bass: root on beats 1 and 3, after the first 2 bars
        if b >= 2:
            for bb in (0, 2):
                bs = s + int(bb * beat * SR); bn = min(int(beat * 1.8 * SR), total - bs)
                if bn <= 0: continue
                t = np.arange(bn) / SR
                f = note_hz(k - 24 + chord[0])
                bass[bs:bs + bn] += np.tanh(1.5 * np.sin(2 * np.pi * f * t)) * env(bn, 0.01, 0.3) * 0.22
        # Plucked arpeggio in 8ths, after the first bar
        if b >= 1:
            pattern = [0, 1, 2, 1, 3, 2, 1, 2]
            for i, idx in enumerate(pattern):
                ps = s + int(i * beat / 2 * SR); pn = min(int(beat * 1.5 * SR), total - ps)
                if pn <= 0: continue
                f = note_hz(k + 12 + chord[idx % len(chord)] - (12 if chord[idx % len(chord)] > 12 else 0))
                arp[ps:ps + pn] += pluck(f, pn, rng) * (0.11 if i % 2 == 0 else 0.08)
        # Light beat from bar 3: soft kick 1 & 3, snap 2 & 4, closed hat 8ths
        if b >= 2:
            for i in range(8):
                ds = s + int(i * beat / 2 * SR)
                if ds >= total: continue
                if i in (0, 4):
                    dn = min(int(0.35 * SR), total - ds); t = np.arange(dn) / SR
                    f = 110 * np.exp(-t * 18) + 45
                    drums[ds:ds + dn] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.35
                if i in (2, 6):
                    dn = min(int(0.18 * SR), total - ds); t = np.arange(dn) / SR
                    drums[ds:ds + dn] += rng.uniform(-1, 1, dn) * np.exp(-t * 28) * 0.035
                dn = min(int(0.05 * SR), total - ds); t = np.arange(dn) / SR
                hat = np.diff(rng.uniform(-1, 1, dn + 1))
                drums[ds:ds + dn] += hat * np.exp(-t * 90) * (0.02 if i % 2 else 0.012)
    pad = lowpass(pad, 1400)
    arp = lowpass(arp, 4200)
    # Gentle pump from the kick so the music breathes
    pump = np.ones(total)
    for b in range(2, nbars):
        for bb in (0, 2):
            ps = int((b * bar + bb * beat) * SR); pn = min(int(0.3 * SR), total - ps)
            if pn > 0: pump[ps:ps + pn] = np.linspace(0.6, 1, pn)
    mix = (pad + arp) * pump + bass * pump + drums
    mix *= env(total, 1.5, 3.0)
    mix /= np.max(np.abs(mix)) + 1e-9
    stereo = np.stack([mix, np.roll(mix, int(0.012 * SR))], axis=1) * 0.8
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, "m.wav")
        with wave.open(wav, "wb") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((stereo * 32767).astype(np.int16).tobytes())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af",
                        "aecho=0.8:0.6:60|120:0.25|0.15,loudnorm=I=-18:TP=-2", "-b:a", "192k", a.out], check=True)
    print(f"Music written: {a.out}")


if __name__ == "__main__":
    main()
