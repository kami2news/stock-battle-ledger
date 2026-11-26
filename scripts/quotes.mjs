// 目標銘柄と日経平均の株価を取得して quotes/latest.json に保存する（GitHub Actions で実行）
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";

const CODES = { "8306": "三菱UFJフィナンシャル・グループ", "8058": "三菱商事", "9432": "NTT", "4502": "武田薬品工業", "7203": "トヨタ自動車", "6501": "日立製作所", "8035": "東京エレクトロン" };
const extra = existsSync("quotes/codes.txt") ? readFileSync("quotes/codes.txt", "utf8").split(/\s+/).filter(c => /^\w{4}$/.test(c)) : [];
for (const c of extra) CODES[c] ??= "";
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

const out = { fetchedAt: jst(Date.now() / 1000), quotes: {} };
for (const [code, name] of [["N225", "日経平均"], ...Object.entries(CODES)]) out.quotes[code] = { name, ...(await get(code)) };
mkdirSync("quotes", { recursive: true });
writeFileSync("quotes/latest.json", JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out));
