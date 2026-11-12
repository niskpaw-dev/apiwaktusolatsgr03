// Ujian kontrak API + helper v1. Jalankan sebelum push:  npm test
// Kalau ada yang GAGAL, perubahan tu akan pecahkan app yang guna API ni.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const handler = require("../api/waktu-solat.js");

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("  GAGAL:", msg); } };
const HHMM = /^\d{2}:\d{2}$/;
const HIJRI_RAW = /^\d{1,2}-(Muh|Saf|Raw|Rak|Jaw|Jak|Rej|Syb|Ram|Syw|Zkh|Zhj)-\d{4}$/;
const ORDER = ["imsak", "subuh", "syuruk", "dhuha", "zohor", "asar", "maghrib", "isyak"];

function call(query) {
  let code = 0, body = "";
  const res = { setHeader() {}, status(c) { code = c; return res; }, send(b) { body = b; return res; }, end() { return res; } };
  handler({ method: "GET", query }, res);
  return { code, json: body ? JSON.parse(body) : null };
}

function checkMeta(j, where) {
  for (const k of ["zone", "zone_name", "state", "year", "source", "source_short", "timezone", "years_available", "location"]) ok(k in j, `${where}: medan meta '${k}' hilang`);
  ok(typeof j.source_short === "string" && j.source_short.length > 0 && j.source_short.length <= 40, `${where}: source_short kosong/terlalu panjang (${j.source_short})`);
  ok(typeof j.zone_name === "string" && j.zone_name.length > 0, `${where}: zone_name kosong`);
  ok(typeof j.source === "string" && j.source.length > 0, `${where}: source kosong`);
}

function checkRow(r, where) {
  ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date), `${where}: date format`);
  ok(HIJRI_RAW.test(r.hijri), `${where}: hijri '${r.hijri}' bukan format DD-Abb-YYYY`);
  ok(typeof r.day === "string" && r.day.length > 0, `${where}: day kosong`);
  for (const k of ORDER) ok(HHMM.test(r[k] || ""), `${where}: ${k} '${r[k]}' bukan HH:MM`);
  for (let i = 1; i < ORDER.length; i++) ok(r[ORDER[i - 1]] < r[ORDER[i]], `${where}: ${ORDER[i - 1]} (${r[ORDER[i - 1]]}) tak sebelum ${ORDER[i]} (${r[ORDER[i]]})`);
}

function checkHijriObj(h, where) {
  ok(h && typeof h === "object", `${where}: objek hijri hilang`);
  if (!h) return;
  for (const k of ["day", "month", "month_abbr", "year", "formatted", "raw"]) ok(k in h, `${where}: hijri.${k} hilang`);
  ok(HIJRI_RAW.test(h.raw), `${where}: hijri.raw format`);
}

// ── 1. Respons ?date untuk sempadan setiap tahun ───────────────────────────
console.log("1. ?date (sempadan tahun)");
const years = call({ date: "2026-06-01" }).json.years_available;
ok(Array.isArray(years) && years.length >= 1, "years_available mesti array");
for (const y of years) {
  for (const d of [`${y}-01-01`, `${y}-12-31`]) {
    const { code, json } = call({ date: d });
    ok(code === 200, `?date=${d} → ${code}`);
    if (code !== 200) continue;
    checkMeta(json, `?date=${d}`);
    ok(json.year === y, `?date=${d}: year ${json.year}`);
    ok(json.date === d, `?date=${d}: date`);
    checkRow(json.times, `?date=${d} times`);
    checkHijriObj(json.hijri_today, `?date=${d} hijri_today`);
    checkHijriObj(json.hijri_maghrib, `?date=${d} hijri_maghrib`);
  }
}

// ── 2. Setiap hari setiap tahun: lengkap & tersusun ────────────────────────
console.log("2. Semua hari (lengkap, berturutan, waktu tersusun)");
for (const y of years) {
  const all = call({ from: `${y}-01-01`, to: `${y}-12-31` }).json.days;
  const expect = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  ok(all.length === expect, `${y}: ${all.length} hari, jangka ${expect}`);
  let prev = null;
  for (const r of all) {
    checkRow(r, r.date);
    if (prev) {
      const n = new Date(prev + "T00:00:00Z"); n.setUTCDate(n.getUTCDate() + 1);
      ok(n.toISOString().slice(0, 10) === r.date, `${y}: lompat dari ${prev} ke ${r.date}`);
    }
    prev = r.date;
  }
}

// ── 3. ?today, ?now, default ──────────────────────────────────────────────
console.log("3. ?today / ?now / tanpa param");
for (const q of [{ today: "" }, {}, { now: "" }]) {
  const { code, json } = call(q);
  const where = "?" + (Object.keys(q)[0] || "(kosong)");
  if (code === 404) { console.log(`  (langkau ${where}: hari ini di luar julat data)`); continue; }
  ok(code === 200, `${where} → ${code}`);
  checkMeta(json, where);
  checkRow(json.times, `${where} times`);
  checkHijriObj(json.hijri_today, `${where} hijri_today`);
  checkHijriObj(json.hijri_maghrib, `${where} hijri_maghrib`);
  if ("now" in q) for (const k of ["current", "next", "minutes_to_next", "countdown"]) ok(k in json, `?now: '${k}' hilang`);
}

// ── 4. ?month ─────────────────────────────────────────────────────────────
console.log("4. ?month");
for (const y of years) {
  const { code, json } = call({ month: "01", year: String(y) });
  ok(code === 200 && json.count === 31 && json.days.length === 31, `?month=01&year=${y}`);
  ok(json.year === y && json.month === "01", `?month=01&year=${y}: year/month`);
  checkMeta(json, `?month=01&year=${y}`);
  ok(json.days[0].date === `${y}-01-01`, `?month=01&year=${y}: hari pertama`);
}
const noYear = call({ month: "02" });
ok(noYear.code === 200 && noYear.json.days.length >= 28, "?month tanpa year masih jalan (app lama)");
ok(call({ month: "13", year: String(years[0]) }).code === 400, "?month=13 → 400");

// ── 5. Ralat ─────────────────────────────────────────────────────────────
console.log("5. Ralat");
ok(call({ date: "1999-01-01" }).code === 404, "tarikh luar julat → 404");
ok(call({ date: "01-01-2027" }).code === 400, "format tarikh salah → 400");

// ── 6. Laluan /api/solat (alias) ─────────────────────────────────────────
console.log("6. vercel.json");
const vj = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
ok((vj.rewrites || []).some((r) => r.source === "/api/solat" && r.destination === "/api/waktu-solat"), "rewrite /api/solat hilang");

// ── 7. Helper waktu-solat-v1.js ──────────────────────────────────────────
console.log("7. Helper waktu-solat-v1.js");
(async () => {
  const store = {};
  const ctx = vm.createContext({
    console, URL,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    fetch: async (url) => {
      const q = Object.fromEntries(new URL(url).searchParams.entries());
      const { code, json } = call(q);
      return { ok: code === 200, status: code, json: async () => json };
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "waktu-solat-v1.js"), "utf8"), ctx);
  const W = ctx.WaktuSolat;
  ok(W && W.VERSION.startsWith("1."), "WaktuSolat.VERSION 1.x");

  let threw = false;
  try { await W.month(undefined, 1); } catch (e) { threw = /tahun wajib/.test(e.message); }
  ok(threw, "month() tanpa tahun mesti ditolak");

  const last = years[years.length - 1];
  const m = await W.month(last, 1);
  ok(m.days.length === 31 && m.year === last, `month(${last}, 1)`);
  ok(W.label(m) === m.zone_name && W.label(m).length > 0, "label() = zone_name");
  ok(W.source(m) === m.source && W.source(m).length > 0, "source() = source");
  ok(W.source(m, { short: true }) === m.source_short && W.source(m, { short: true }).length < W.source(m).length, "source({short:true}) = source_short");

  const d = await W.date(`${last}-01-01`);
  const ds = W.toDates(d.times);
  ok(ds.subuh.toISOString() === new Date(`${last}-01-01T${d.times.subuh}:00+08:00`).toISOString(), "toDates() masa Malaysia");
  ok(Object.keys(store).length > 0, "date() simpan cache");

  const ph = W.parseHijri("22-Rej-1448");
  ok(ph && ph.formatted === "22 Rejab 1448H" && ph.month_abbr === "Rej", "parseHijri()");
  ok(W.fmt12(new Date("2027-01-01T05:38:00+08:00")) === "05:38 AM" && W.fmt12(new Date("2027-01-01T13:20:00+08:00")) === "01:20 PM", "fmt12()");

  // Selepas Isyak → Imsak esok (kes yang pernah pecah)
  const isyakNight = new Date(`${years[0]}-12-31T23:30:00+08:00`);
  const n1 = await W.next(null, isyakNight);
  const jan1 = call({ date: `${years[0] + 1}-01-01` });
  if (jan1.code === 200) {
    ok(n1.key === "imsak" && n1.isTomorrow && n1.time.toISOString() === new Date(`${years[0] + 1}-01-01T${jan1.json.times.imsak}:00+08:00`).toISOString(), "next() 31 Dis 23:30 → Imsak 1 Jan tahun depan");
  }
  const noon = new Date(`${last}-06-01T14:00:00+08:00`);
  const n2 = await W.next(null, noon);
  ok(n2.key === "asar" && !n2.isTomorrow, `next() 14:00 → ${n2.key}`);
  const dj = await W.date(`${last}-06-01`);
  ok(W.hijriNow(dj, new Date(`${last}-06-01T23:00:00+08:00`)) === dj.hijri_maghrib, "hijriNow() selepas Maghrib");
  ok(W.hijriNow(dj, new Date(`${last}-06-01T10:00:00+08:00`)) === dj.hijri_today, "hijriNow() siang");

  console.log(`\n${fail ? "❌" : "✅"} ${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("Ralat ujian:", e); process.exit(1); });
