"""Phillip & Adela's entrance: ~8.8 s of soft, scratchy swing, as if from an old 78 in the lounge car — long enough to
play on through the banner's fade (DM 2026-09-19: "make it a bit longer for the fade"; it had stopped at ~3 s).
Six bars — F6 | D7 | G7 | C7 | F6 D7 | G7 C7 | F — then the band lands.
Rendered offline with numpy (no oscillator bleeps live in the page): a small swing combo — clarinet lead,
walking bass, rhythm-guitar chop, brushes, a quiet sax bed — pushed through a phonograph chain
(narrow band, a little saturation, wow and flutter, needle hiss and crackle). Writes snd/druskenvald.mp3."""
from pathlib import Path

import numpy as np

from snd import save

SR = 44100
BPM = 184
B = 60 / BPM                      # one beat
rng = np.random.default_rng(1926)
NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(n):
    m = NOTE[n[0]] + (1 if "#" in n else -1 if "b" in n[1:] else 0) + (int(n[-1]) + 1) * 12
    return 440 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def band(x, lo=None, hi=None, order_lo=2, order_hi=2, peaks=()):
    """Zero-phase filtering in the frequency domain: Butterworth-shaped edges plus gentle peaks (f, dB, octaves)."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = 1e-3
    h = np.ones_like(f)
    if lo: h *= 1 / np.sqrt(1 + (lo / f) ** (2 * order_lo))
    if hi: h *= 1 / np.sqrt(1 + (f / hi) ** (2 * order_hi))
    for fc, db, width in peaks:
        h *= 10 ** (db / 20 * np.exp(-0.5 * (np.log2(f / fc) / width) ** 2))
    return np.fft.irfft(np.fft.rfft(x) * h, n)


def ks(f, dur, bright, damp):
    """Karplus-Strong pluck, computed a delay-line at a time (each block depends only on the one before)."""
    N = max(2, int(round(SR / f)))
    n = int(dur * SR)
    y = np.zeros(n + N + 1)
    y[:N + 1] = band(rng.uniform(-1, 1, N + 1), hi=2500 + 6000 * bright)
    i = N + 1
    while i < len(y):
        j = min(i + N, len(y))
        a, b = y[i - N:j - N], y[i - N - 1:j - N - 1]
        y[i:j] = damp * (bright * a + (1 - bright) * 0.5 * (a + b))
        i = j
    return y[N + 1:N + 1 + n]


def env_ar(n, a, r, hold_end=None):
    e = np.ones(n)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na) ** 1.5
    nr = max(1, int(r * SR))
    e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


TOTAL = 9.0
BEATS = 25                        # six bars and the landing
mix = {k: np.zeros(int(TOTAL * SR)) for k in ("bass", "gtr", "ride", "brush", "kick", "clar", "sax")}


def put(track, start, sig):
    s = int(start * SR)
    e = min(len(mix[track]), s + len(sig))
    mix[track][s:e] += sig[:e - s]


def swing(beat):
    """Swung eighths: an off-beat 'and' lands two-thirds of the way through the beat."""
    whole, frac = divmod(beat, 1)
    return (whole + (2 / 3 if abs(frac - 0.5) < 1e-6 else frac)) * B


# --- walking bass (quarters): F6 | D7 | G7 | C7 | F6 D7 | G7 C7 | F ---------------------------------------
BASS = ["F2", "A2", "C3", "D3", "D2", "F#2", "A2", "C3", "G2", "B2", "D3", "F3", "C3", "E3", "G2", "Bb2",
        "F2", "A2", "D2", "F#2", "G2", "D3", "C3", "Bb2", "F2"]
for beat, note in enumerate(BASS):
    dur = B * (1.9 if beat == BEATS - 1 else 0.95)
    s = ks(hz(note), dur, bright=0.06, damp=0.9975)
    s = band(s, lo=45, hi=1400, peaks=((110, 3, 0.8),))
    thump = band(rng.uniform(-1, 1, int(0.02 * SR)), hi=400) * np.linspace(1, 0, int(0.02 * SR))
    s[:len(thump)] += 0.6 * thump
    put("bass", beat * B, s * env_ar(len(s), 0.004, 0.06) * (1.1 if beat % 2 == 0 else 0.95))

# --- rhythm guitar, four to the bar (Freddie Green): short muted chords --------------------------------------
F6, D7, G7, C7 = ["F3", "A3", "D4"], ["F#3", "A3", "C4"], ["G3", "B3", "F4"], ["Bb3", "E4", "G4"]
CHORDS = {0: F6, 4: D7, 8: G7, 12: C7, 16: F6, 18: D7, 20: G7, 22: C7, 24: ["A3", "C4", "F4"]}
for beat in range(BEATS):
    chord = CHORDS[max(k for k in CHORDS if k <= beat)]
    for i, note in enumerate(chord):
        s = ks(hz(note), 0.2, bright=0.3, damp=0.99) * env_ar(int(0.2 * SR), 0.002, 0.08)
        put("gtr", beat * B + i * 0.007, s * (1.0 if beat % 2 else 0.8))

# --- brushes: swish on the snare, taps on 2 and 4, ride "ding, ding-da-ding", a feathered kick --------------
n = len(mix["brush"])
swish = band(rng.uniform(-1, 1, n), lo=1800, hi=7000)
phase = (tt(n) / (2 * B)) % 1
mix["brush"] += 0.25 * swish * (0.35 + 0.65 * np.sin(np.pi * phase) ** 2)
for beat in range(1, BEATS - 1, 2):
    m = int(0.14 * SR)
    hit = band(rng.uniform(-1, 1, m), lo=1200, hi=6000) * np.exp(-tt(m) / 0.045)
    put("brush", beat * B, hit)
for pos in [4 * bar + p for bar in range(6) for p in (0, 1, 1.5, 2, 3, 3.5)] + [BEATS - 1]:
    m = int(0.45 * SR)
    x = tt(m)
    tone = sum(a * np.sin(2 * np.pi * f * x + rng.uniform(0, 6.28)) for f, a in
               ((3120, 1), (4270, .8), (5330, .7), (6710, .5), (8150, .4), (9420, .3)))
    s = (0.25 * tone + band(rng.uniform(-1, 1, m), lo=5000)) * np.exp(-x / 0.25) * (1 - np.exp(-x / 0.001))
    put("ride", swing(pos), s * (0.7 if pos % 1 else 1.0))
for beat in range(BEATS):
    m = int(0.1 * SR)
    x = tt(m)
    put("kick", beat * B, np.sin(2 * np.pi * np.cumsum(np.linspace(62, 44, m)) / SR) * np.exp(-x / 0.035))

# --- clarinet lead: odd harmonics, a scoop into each note, late vibrato, a breath of air ----------------------
MELODY = [(0, "C5", .6), (.5, "A4", .3), (1, "C5", .6), (1.5, "D5", .3), (2, "F5", .95), (3, "D5", .6), (3.5, "C5", .3),
          (4, "A4", .6), (4.5, "C5", .3), (5, "D5", .6), (5.5, "F#5", .3), (6, "A5", .95), (7, "F#5", .6), (7.5, "D5", .3),
          (8, "B4", .95), (9, "D5", .6), (9.5, "F5", .3), (10, "G5", .95), (11, "F5", .6), (11.5, "D5", .3),
          (12, "E5", .6), (12.5, "C5", .3), (13, "Bb4", .95), (14, "G4", .6), (14.5, "Bb4", .3), (15, "C5", .95),
          (16, "F5", .6), (16.5, "D5", .3), (17, "C5", .6), (17.5, "A4", .3), (18, "F#4", .6), (18.5, "A4", .3), (19, "C5", .6),
          (19.5, "D5", .3), (20, "F5", .95), (21, "D5", .6), (21.5, "B4", .3), (22, "Bb4", .6), (22.5, "G4", .3), (23, "E5", .6),
          (23.5, "C5", .3), (24, "A4", 2.0)]
for pos, note, beats in MELODY:
    dur = beats * B + 0.05
    m = int(dur * SR)
    x = tt(m)
    f0 = hz(note)
    cents = -38 * np.exp(-x / 0.035)
    vib = 0.004 * np.sin(2 * np.pi * 5.3 * x) * np.clip((x - 0.14) / 0.2, 0, 1)
    ph = 2 * np.pi * np.cumsum(f0 * 2 ** (cents / 1200) * (1 + vib)) / SR
    tone = sum(a * np.sin(k * ph) for k, a in ((1, 1), (2, .07), (3, .5), (4, .05), (5, .28), (6, .03), (7, .14), (9, .06), (11, .025)))
    e = env_ar(m, 0.035, 0.07)
    air = band(rng.uniform(-1, 1, m), lo=1400, hi=3600) * 0.07
    put("clar", swing(pos), (tone + air) * e * (1.0 if pos % 1 == 0 else 0.85))

# --- a quiet sax-section bed under it all ---------------------------------------------------------------------
S_F6, S_D7, S_G7, S_C7 = ["A3", "C4", "D4", "F4"], ["F#3", "A3", "C4", "D4"], ["B3", "D4", "F4", "G4"], ["Bb3", "C4", "E4", "G4"]
BED = [(0, S_F6, 4), (4, S_D7, 4), (8, S_G7, 4), (12, S_C7, 4), (16, S_F6, 2), (18, S_D7, 2), (20, S_G7, 2), (22, S_C7, 2),
       (24, S_F6, 2.4)]
for pos, notes, beats in BED:
    m = int(beats * B * SR)
    x = tt(m)
    s = np.zeros(m)
    for note in notes:
        for det in (-5, 4):
            f0 = hz(note) * 2 ** (det / 1200)
            s += sum((1 / k ** 1.3) * np.sin(2 * np.pi * k * f0 * x) for k in range(1, 13) if k * f0 < 6000)
    s = band(s, hi=1800, order_hi=3, peaks=((900, 3, 0.6),)) * env_ar(m, 0.09, 0.12) * (1 + 0.05 * np.sin(2 * np.pi * 4.2 * x))
    put("sax", pos * B, s)

# --- mix, then the phonograph ------------------------------------------------------------------------------------
def unit(x):
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-9)

LEVEL = {"bass": 0.34, "gtr": 0.16, "ride": 0.05, "brush": 0.1, "kick": 0.08, "clar": 0.3, "sax": 0.07}
music = sum(unit(mix[k]) * v for k, v in LEVEL.items())
music = band(music, lo=280, hi=3900, order_lo=3, order_hi=4, peaks=((1500, 3, 0.7), (650, 1.5, 0.5)))
music = np.tanh(1.8 * music / np.max(np.abs(music))) / np.tanh(1.8)

# wow and flutter: read the groove a touch fast and slow
x = tt(len(music))
warp = x + 0.0011 * np.sin(2 * np.pi * 0.55 * x) + 0.00022 * np.sin(2 * np.pi * 7.3 * x + 1.3)
music = np.interp(np.clip(warp, 0, x[-1]), x, music)

LEAD = 0.18                                   # the needle lands, then the band
out = np.zeros(int((TOTAL + LEAD) * SR))
out[int(LEAD * SR):int(LEAD * SR) + len(music)] += music
n = len(out)
hiss = band(rng.uniform(-1, 1, n), lo=400, hi=5500) * 0.035
clicks = np.zeros(n)
for rate, amp in ((22, 0.25), (3, 0.9)):
    k = rng.poisson(rate * n / SR)
    idx = rng.integers(0, n - 3, k)
    clicks[idx] += amp * rng.exponential(1, k) * rng.choice([-1, 1], k)
clicks = band(clicks, lo=500, hi=5000) * 3
out = out + hiss + clicks

# length ~8.8 s: past the banner's own fade (it hushes every sound from 6.1 s to 8.3 s); fade the tail, keep it soft
LENGTH = 8.8
out = out[:int(LENGTH * SR)]
f_in, f_out = int(0.01 * SR), int(0.6 * SR)
out[:f_in] *= np.linspace(0, 1, f_in)
out[-f_out:] *= np.cos(np.linspace(0, np.pi / 2, f_out)) ** 2
rms = np.sqrt(np.mean(out ** 2))
out *= 10 ** (-24 / 20) / rms
peak = np.max(np.abs(out))
if peak > 0.7:
    out *= 0.7 / peak
stereo = np.vstack([out, out]).astype(np.float32)
dest = Path(__file__).parent / "snd" / "druskenvald.mp3"
save(stereo, dest)
print(f"{dest.name}: {len(out) / SR:.2f}s, rms {20 * np.log10(np.sqrt(np.mean(out ** 2))):.1f} dBFS, peak {20 * np.log10(np.max(np.abs(out))):.1f} dBFS, {dest.stat().st_size // 1024}KB")
