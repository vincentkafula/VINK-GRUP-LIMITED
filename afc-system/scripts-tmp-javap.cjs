// Minimal Java class-file reader: lists public methods (name + descriptor) of the classes matching a filter.
const fs = require("fs"), path = require("path");
const [, , dir, filter] = process.argv;
function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; }
function parse(buf) {
  let o = 8; const cp = [null]; const u2 = () => { const v = buf.readUInt16BE(o); o += 2; return v; }; const u4 = () => { const v = buf.readUInt32BE(o); o += 4; return v; };
  const n = u2();
  for (let i = 1; i < n; i++) {
    const t = buf[o++];
    if (t === 1) { const l = u2(); cp[i] = { t, s: buf.toString("utf8", o, o + l) }; o += l; }
    else if (t === 3 || t === 4) { o += 4; cp[i] = { t }; } else if (t === 5 || t === 6) { o += 8; cp[i] = { t }; i++; }
    else if (t === 7 || t === 8 || t === 16 || t === 19 || t === 20) { cp[i] = { t, a: u2() }; }
    else if (t === 9 || t === 10 || t === 11 || t === 12 || t === 17 || t === 18) { cp[i] = { t, a: u2(), b: u2() }; }
    else if (t === 15) { o += 3; cp[i] = { t }; } else throw new Error("cp tag " + t);
  }
  const access = u2(), thisC = u2(), superC = u2(); const name = cp[cp[thisC].a].s;
  const ic = u2(); o += ic * 2;
  const skipAttrs = () => { const c = u2(); for (let i = 0; i < c; i++) { u2(); const l = u4(); o += l; } };
  const fc = u2(); for (let i = 0; i < fc; i++) { u2(); u2(); u2(); skipAttrs(); }
  const mc = u2(); const methods = [];
  for (let i = 0; i < mc; i++) { const acc = u2(), nm = cp[u2()].s, ds = cp[u2()].s; skipAttrs(); if (acc & 1) methods.push(`${nm}${ds}`); }
  return { name, methods };
}
for (const f of walk(dir).filter((f) => f.endsWith(".class") && (!filter || f.replace(/\\/g, "/").includes(filter)))) {
  try { const c = parse(fs.readFileSync(f)); console.log("\n" + c.name); for (const m of c.methods) console.log("  " + m); } catch (e) { console.log("!! " + f + ": " + e.message); }
}
