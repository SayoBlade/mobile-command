/**
 * BUILD THE RELEASE ZIP — `node tools/build-release.mjs` → dist/module.zip (+ dist/module.json).
 *
 * ⚠️ NO AUDIO IN A RELEASED BUILD (DM 2026-10-31). Music and sounds are licensed or third-party
 * ("not for reshare/sale"); the repo may hold a file, a release never does. Audio is skipped by
 * extension while staging, and the finished zip is read back and the build FAILS if any audio entry
 * made it in. A shipped feature that wants a sound refers to a path in the DM's Data folder instead.
 *
 * The zip is written here (no PowerShell, no `zip` binary) so it is the same on Windows and Linux,
 * with forward-slash paths Foundry's installer expects.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(repo, "dist");

/** What a release carries. Everything else (docs, tools, archive, art/source) stays in the repo. */
const SHIP = ["module.json", "scripts", "styles", "lang", "fonts", "art", "sounds"];
const SKIP_DIRS = new Set([path.join("art", "source")]);
export const AUDIO = /\.(mp3|ogg|oga|opus|wav|flac|m4a|aac|webm|weba|mid|midi)$/i;

function collect(rel, out) {
  const abs = path.join(repo, rel);
  if (!fs.existsSync(abs) || SKIP_DIRS.has(rel)) return;
  if (fs.statSync(abs).isDirectory()) {
    for (const e of fs.readdirSync(abs).sort()) collect(path.join(rel, e), out);
  } else if (AUDIO.test(rel)) {
    console.log(`skip (audio): ${rel.replaceAll("\\", "/")}`);
  } else out.push(rel);
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function writeZip(file, entries) {
  const parts = [], central = []; let off = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name, "utf8"), z = zlib.deflateRawSync(data), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(8, 8); h.writeUInt32LE(0x00210000, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(z.length, 18);
    h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10); c.writeUInt32LE(0x00210000, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(z.length, 20);
    c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, n, z); central.push(c, n); off += 30 + n.length + z.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  fs.writeFileSync(file, Buffer.concat([...parts, cd, end]));
}

/** The entry names in a zip, read from its central directory — the check reads the real artifact. */
export function zipEntries(file) {
  const b = fs.readFileSync(file); let e = b.length - 22;
  while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error(`${file}: not a zip`);
  const names = []; let p = b.readUInt32LE(e + 16);
  for (let i = 0, n = b.readUInt16LE(e + 10); i < n; i++) {
    const len = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), note = b.readUInt16LE(p + 32);
    names.push(b.toString("utf8", p + 46, p + 46 + len)); p += 46 + len + extra + note;
  }
  return names;
}

const files = []; for (const s of SHIP) collect(s, files);
fs.mkdirSync(dist, { recursive: true });
const zip = path.join(dist, "module.zip");
writeZip(zip, files.map((f) => ({ name: f.replaceAll("\\", "/"), data: fs.readFileSync(path.join(repo, f)) })));
fs.copyFileSync(path.join(repo, "module.json"), path.join(dist, "module.json"));

const names = zipEntries(zip);
const audio = names.filter((n) => AUDIO.test(n));
if (audio.length) {
  fs.rmSync(zip, { force: true });
  console.error(`RELEASE REFUSED — audio would ship:\n  ${audio.join("\n  ")}`);
  process.exit(1);
}
console.log(`built ${path.relative(repo, zip)} — ${names.length} files, ${(fs.statSync(zip).size / 1048576).toFixed(1)} MB, no audio`);
