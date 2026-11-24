// entries/*.txt を集計して _site/ledger.json を作る（依存なし）
import { readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";

const num = s => Number(String(s).replace(/[,，円\s]/g, ""));
const who = s => { s = String(s).trim().toLowerCase(); return s === "claude" ? "claude" : (s === "muse" || s === "あんこ") ? "muse" : null; };
const trades = [], prices = [], bad = [];

const files = existsSync("entries") ? readdirSync("entries").filter(f => f.endsWith(".txt")).sort() : [];
for (const file of files) {
  const m = file.match(/^(\d{8})-(\d{6})/);
  const base = m ? Date.UTC(+m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8), +m[2].slice(0, 2), +m[2].slice(2, 4), +m[2].slice(4, 6)) : 0;
  readFileSync("entries/" + file, "utf8").split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach((line, i) => {
    const f = line.split(/[|｜]/).map(s => s.trim()), id = file + (i ? "#" + i : ""), ts = base + i;
    if (f[0] === "記入" && f.length === 8 && who(f[1])) {
      trades.push({ id, file, ts, p: who(f[1]), d: f[2], side: f[3] === "買" ? "buy" : f[3] === "売" ? "sell" : "?", code: f[4], name: f[5], qty: num(f[6]), px: num(f[7]) });
    } else if (f[0] === "現在値" && f.length === 5) {
      prices.push({ id, file, ts, d: f[1], code: f[2], name: f[3], px: num(f[4]) });
    } else bad.push({ file });
  });
}

mkdirSync("_site", { recursive: true });
copyFileSync("index.html", "_site/index.html");
copyFileSync("setup.html", "_site/setup.html");
if (existsSync("config/writer.json")) copyFileSync("config/writer.json", "_site/writer.json");
writeFileSync("_site/ledger.json", JSON.stringify({ built: new Date().toISOString(), trades, prices, bad }));
console.log(`trades=${trades.length} prices=${prices.length} bad=${bad.length}`);
