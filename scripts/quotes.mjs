// 株価を取得して quotes/latest.json と quotes/history/日付.jsonl に保存する（GitHub Actions で実行）
// 対象：目標銘柄＋日経平均＋記録場（entries/）に出てくる全銘柄
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, appendFileSync } from "node:fs";

const CODES = { "8306": "三菱UFJフィナンシャル・グループ", "8058": "三菱商事", "9432": "NTT", "4502": "武田薬品工業", "7203": "トヨタ自動車", "6501": "日立製作所", "8035": "東京エレクトロン" };
if (existsSync("entries")) for (const f of readdirSync("entries").filter(f => f.endsWith(".txt"))) {
  for (const line of readFileSync("entries/" + f, "utf8").split(/\r?\n/)) {
    const x = line.split(/[|｜]/).map(s => s.trim());
    const [code, name] = x[0] === "記入" ? [x[4], x[5]] : x[0] === "現在値" ? (x.length === 6 ? [x[3], x[4]] : [x[2], x[3]]) : [];
    if (code && /^[0-9A-Z]{4}$/.test(code)) CODES[code] ??= name || "";
  }
}
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
const jst = s => new Date(s * 1000 + 9 * 3600e3).toISOString().slice(0, 19).replace("T", " ");

async function yahoo(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`, { headers: UA });
  if (!r.ok) throw new Error("yahoo " + r.status);
  const m = (await r.json()).chart.result[0].meta;
  if (typeof m.regularMarketPrice !== "number") throw new Error("yahoo no price");
  return { price: m.regularMarketPrice, time: jst(m.regularMarketTime), prevClose: m.chartPreviousClose ?? null, source: "Yahoo Finance chart API" };
}
async function stooq(sym) {
  const r = await fetch(`https://stooq.com/q/l/?s=${sym}&f=sd2t2c&h&e=csv`, { headers: UA });
  if (!r.ok) throw new Error("stooq " + r.status);
  const [, row] = (await r.text()).trim().split(/\r?\n/);
  const [, d, t, c] = row.split(",");
  if (!c || c === "N/D") throw new Error("stooq no price");
  return { price: Number(c), time: `${d} ${t} (stooq表記)`, prevClose: null, source: "stooq" };
}
async function get(code) {
  const ys = code === "N225" ? "^N225" : code + ".T", ss = code === "N225" ? "^nkx" : code.toLowerCase() + ".jp";
  try { return await yahoo(ys); } catch (e1) {
    try { return { ...(await stooq(ss)), note: String(e1) }; } catch (e2) { return { error: `${e1} / ${e2}` }; }
  }
}

const now = jst(Date.now() / 1000);
const out = { fetchedAt: now, quotes: {} };
for (const [code, name] of [["N225", "日経平均"], ...Object.entries(CODES)]) out.quotes[code] = { name, ...(await get(code)) };
mkdirSync("quotes/history", { recursive: true });
writeFileSync("quotes/latest.json", JSON.stringify(out, null, 1) + "\n");

// 履歴：今日の取引時間中の値だけ、1行1回分（t=取得時刻、q=コード→[株価, 株価の時刻]）
const today = now.slice(0, 10), q = {};
for (const [c, v] of Object.entries(out.quotes)) if (typeof v.price === "number" && String(v.time).startsWith(today)) q[c] = [v.price, v.time.slice(11, 16)];
if (Object.keys(q).length) {
  const file = `quotes/history/${today}.jsonl`;
  const prev = existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").pop() : "";
  const same = prev && JSON.stringify(JSON.parse(prev).q) === JSON.stringify(q);
  if (!same) appendFileSync(file, JSON.stringify({ t: now, q }) + "\n");
  const days = readdirSync("quotes/history").filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).map(f => f.slice(0, 10)).sort();
  writeFileSync("quotes/history/index.json", JSON.stringify({ days }) + "\n");
}
console.log(now, Object.keys(q).length, "銘柄を記録");
