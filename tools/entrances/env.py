"""RMS envelope (dBFS per 0.25 s) of library files, to pick sound windows by measurement."""
import os, sys
from pathlib import Path
import numpy as np
from snd import load
D = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data"
for rel in sys.argv[1:]:
    a = load(D / rel, 0, 12).mean(axis=0)
    step = int(0.25 * 44100)
    env = [20 * np.log10(np.sqrt(np.mean(a[i:i + step] ** 2)) + 1e-9) for i in range(0, len(a), step)]
    print(f"{rel.split('/')[-1]} ({len(a)/44100:.1f}s): " + " ".join(f"{e:.0f}" for e in env))
