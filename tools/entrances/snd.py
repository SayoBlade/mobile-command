"""Trim recordings from the DM's library into short MP3 clips for the entrance page (the originals are only read).
sndspec.json: [{"out": "snd/x.mp3", "src": "<full path>", "start": s, "end": s, "fin": s, "fout": s, "rms": dBFS}]"""
import json
import sys
from pathlib import Path

import av
import numpy as np

RATE = 44100
here = Path(__file__).parent


def load(src, start, end):
    inp = av.open(str(src))
    res = av.AudioResampler(format="fltp", layout="stereo", rate=RATE)
    chunks, got = [], 0
    for frame in inp.decode(audio=0):
        for f in res.resample(frame):
            chunks.append(f.to_ndarray()); got += f.samples
        if got / RATE > end + 0.5:
            break
    for f in res.resample(None):
        chunks.append(f.to_ndarray())
    inp.close()
    arr = np.concatenate(chunks, axis=1).astype(np.float32)
    return arr[:, int(start * RATE):int(end * RATE)]


def shape(arr, fin, fout, rms_db):
    n = arr.shape[1]
    env = np.ones(n, dtype=np.float32)
    a, b = int(fin * RATE), int(fout * RATE)
    if a: env[:a] = np.linspace(0, 1, a) ** 2
    if b: env[n - b:] = np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    arr = arr * env
    rms = float(np.sqrt(np.mean(arr ** 2))) or 1e-9
    gain = 10 ** (rms_db / 20) / rms
    peak = float(np.max(np.abs(arr))) * gain
    if peak > 0.89:                     # keep the loudest moment under -1 dBFS
        gain *= 0.89 / peak
    return arr * gain, 20 * np.log10(rms * gain), 20 * np.log10(float(np.max(np.abs(arr))) * gain)


def save(arr, out):
    out.parent.mkdir(exist_ok=True)
    c = av.open(str(out), "w", format="mp3")
    s = c.add_stream("libmp3lame", rate=RATE, layout="stereo")
    s.bit_rate = 128000
    frame = av.AudioFrame.from_ndarray(np.ascontiguousarray(arr), format="fltp", layout="stereo")
    frame.sample_rate = RATE
    for p in s.encode(frame): c.mux(p)
    for p in s.encode(None): c.mux(p)
    c.close()


if __name__ == "__main__":
    spec = json.loads((here / (sys.argv[1] if len(sys.argv) > 1 else "sndspec.json")).read_text(encoding="utf-8"))
    for item in spec:
        arr = load(Path(item["src"]), item["start"], item["end"])
        arr, rms, peak = shape(arr, item.get("fin", 0.01), item.get("fout", 0.4), item.get("rms", -20))
        out = here / item["out"]
        save(arr, out)
        print(f'{item["out"]:<28} {arr.shape[1] / RATE:4.1f}s  rms {rms:5.1f}  peak {peak:5.1f} dBFS  {out.stat().st_size // 1024}KB')
