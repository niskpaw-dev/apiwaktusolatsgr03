// api/waktu-solat.js
// Waktu Solat API — Zon SGR03 (Klang, Kuala Langat), Selangor
// Waktu asas: 2026 = JAKIM e-Solat, 2027 = Takwim Mufti Selangor (Daerah Kuala Langat).
// Dhuha + pelarasan Bukit Jugra: ketetapan Mufti Selangor.
// 8 waktu: Imsak, Subuh, Syuruk, Dhuha, Zohor, Asar, Maghrib, Isyak.

// Setiap tahun = satu fail. Tahun baru: tambah satu baris di sini (data lama boleh kekal).
const DATASETS = [
  require("./_data/sgr03-2026.json"),
  require("./_data/sgr03-2027.json"),
];
const BY_YEAR = Object.fromEntries(DATASETS.map((d) => [d.year, d]));
const LATEST = DATASETS[DATASETS.length - 1];
// Gabung semua tahun -> peralihan 31 Dis -> 1 Jan (esok, Hijri selepas Maghrib) lancar.
const DB = { ...LATEST, days: DATASETS.flatMap((d) => d.days) };
const YEARS = DATASETS.map((d) => d.year);
const RANGE_TXT = YEARS.length > 1 ? `${YEARS[0]}-${YEARS[YEARS.length - 1]}` : `${YEARS[0]}`;

const TZ = "Asia/Kuala_Lumpur";
// Default Dhuha = formula falak 1/3 (padan jadual contoh). Override: ?dhuha=offset&dhuha_offset=25
const DEFAULT_DHUHA_METHOD = "formula";
const DEFAULT_DHUHA_OFFSET = 25; // digunakan hanya bila ?dhuha=offset tanpa dhuha_offset
// Set "jugra" kalau nak pelarasan Bukit Jugra jadi default deploy. null = zon SGR03 umum.
const DEFAULT_ADJUST = null;

const SEQUENCE = ["subuh", "syuruk", "dhuha", "zohor", "asar", "maghrib", "isyak"];
const LABELS = {
  imsak: "Imsak", subuh: "Subuh", syuruk: "Syuruk", dhuha: "Dhuha",
  zohor: "Zohor", asar: "Asar", maghrib: "Maghrib", isyak: "Isyak",
};

// --- Hijri (BARU) --------------------------------------------------------
// Singkatan bulan dalam data JAKIM -> nama penuh Melayu.
const HIJRI_FULL = {
  Muh: "Muharram", Saf: "Safar", Raw: "Rabiulawal", Rak: "Rabiulakhir",
  Jaw: "Jamadilawal", Jak: "Jamadilakhir", Rej: "Rejab", Syb: "Syaaban",
  Ram: "Ramadan", Syw: "Syawal", Zkh: "Zulkaedah", Zhj: "Zulhijjah",
};

// "16-Zhj-1447" -> { day, month, month_abbr, year, formatted, raw }
// Defensif: input bukan-string -> null; format tak dijangka -> { raw } sahaja.
function parseHijri(str) {
  if (typeof str !== "string") return null;
  const m = str.split("-");
  if (m.length !== 3) return { raw: str };
  const day = parseInt(m[0], 10);
  const month = HIJRI_FULL[m[1]] || m[1]; // abbr asing -> guna apa adanya, takkan crash
  const year = parseInt(m[2], 10);
  return {
    day, month, month_abbr: m[1], year,
    formatted: `${day} ${month} ${year}H`, // cth "16 Zulhijjah 1447H"
    raw: str,
  };
}

// Hijri hari ini + Hijri selepas Maghrib.
// Selepas Maghrib, tarikh Islam = hari Gregorian esok -> baca baris esok terus
// dari data JAKIM (rollover bulan/tahun sudah betul, tiada kiraan di sini).
function hijriPair(day) {
  const tom = dayByOffset(day.date, 1);
  return {
    hijri_today: parseHijri(day.hijri),
    hijri_maghrib: parseHijri((tom || day).hijri), // fallback: hari terakhir data
  };
}

// --- helpers -------------------------------------------------------------

function todayKL() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function nowMinutesKL() {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  return (+p.find((x) => x.type === "hour").value) * 60 + (+p.find((x) => x.type === "minute").value);
}

const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fmtMin = (x) => { x = ((x % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

const byDate = Object.fromEntries(DB.days.map((d) => [d.date, d]));

function dayByOffset(dateStr, offset) {
  // UTC sepenuhnya -> betul tak kira zon waktu server (Vercel UTC, PC +08, dsb.)
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return byDate[d.toISOString().slice(0, 10)] || null;
}

function wantsJugra(q) {
  return (q.adjust || q.loc || (q.jugra === "1" ? "jugra" : "") || DEFAULT_ADJUST || "").toLowerCase() === "jugra";
}
function jugraApplies(q, ds) { return wantsJugra(q) && !!(ds.adjustments && ds.adjustments.jugra); }

// Single source of truth for deriving a final row from base data + query options.
// Idempotent for defaults (no params) -> returns the baked values unchanged.
//   ?adjust=jugra                -> Syuruk -1, Maghrib +1 (Bukit Jugra)
//   ?dhuha=formula               -> Dhuha = Syuruk + round(1/3*(Syuruk-Subuh))  [default]
//   ?dhuha=offset&dhuha_offset=N -> Dhuha = Syuruk + N  (cth 25 = ketetapan Mufti)
function transform(day, q) {
  const subuh = toMinutes(day.subuh);
  let syuruk = toMinutes(day.syuruk);
  let maghrib = toMinutes(day.maghrib);

  const ds = BY_YEAR[+day.date.slice(0, 4)] || LATEST;
  // Jugra hanya untuk tahun yang datasetnya ada pelarasan (2026 zon lama). 2027 = jadual daerah, tiada.
  if (jugraApplies(q, ds)) { syuruk -= 1; maghrib += 1; }

  // Default Dhuha ikut tahun: 2026 = formula 1/3, 2027 = Syuruk + 25 (takwim Mufti).
  const dd = ds.dhuha_default || { method: DEFAULT_DHUHA_METHOD, offset: DEFAULT_DHUHA_OFFSET };
  const dm = (q.dhuha || dd.method).toLowerCase();
  let dhuha;
  if (dm === "offset") {
    const n = Number.isFinite(+q.dhuha_offset) ? +q.dhuha_offset : (dd.offset ?? DEFAULT_DHUHA_OFFSET);
    dhuha = syuruk + n;
  } else {
    dhuha = syuruk + Math.round((syuruk - subuh) / 3); // formula falak 1/3
  }

  return { ...day, syuruk: fmtMin(syuruk), dhuha: fmtMin(dhuha), maghrib: fmtMin(maghrib) };
}

function computeNow(day, mins) {
  const slots = SEQUENCE.map((k) => ({ key: k, name: LABELS[k], time: day[k], mins: toMinutes(day[k]) }));
  let current = null, next = null;
  for (const s of slots) {
    if (s.mins <= mins) current = s;
    if (s.mins > mins && !next) next = s;
  }
  if (!current) {
    const prev = dayByOffset(day.date, -1);
    current = prev ? { key: "isyak", name: "Isyak", time: prev.isyak, mins: toMinutes(prev.isyak) - 1440 } : null;
  }
  if (!next) {
    const tom = dayByOffset(day.date, 1);
    next = tom ? { key: "subuh", name: "Subuh", time: tom.subuh, mins: toMinutes(tom.subuh) + 1440 } : null;
  }
  const minsToNext = next ? next.mins - mins : null;
  return {
    current: current ? { prayer: current.key, name: current.name, time: current.time } : null,
    next: next ? { prayer: next.key, name: next.name, time: next.time } : null,
    minutes_to_next: minsToNext,
    countdown: minsToNext != null ? fmtMin(minsToNext) : null,
  };
}

// year/source ikut tahun tarikh yang diminta (2026 = JAKIM, 2027 = Mufti Selangor).
function meta(q, date) {
  const year = +(date || todayKL()).slice(0, 4);
  const ds = BY_YEAR[year] || LATEST;
  const jugra = jugraApplies(q, ds);
  return {
    zone: DB.zone, zone_name: ds.zone_name, state: DB.state,
    year, source: ds.source, source_short: ds.source_short || ds.source, timezone: DB.timezone, years_available: YEARS,
    location: jugra ? "Puncak Bukit Jugra" : (year >= 2027 ? "Daerah Kuala Langat" : "SGR03 (umum)"),
    dhuha_method: ds.dhuha_method,
    ...(wantsJugra(q) && !jugra ? { note: "Pelarasan Bukit Jugra tidak terpakai bagi takwim daerah 2027." } : {}),
  };
}

// Saat hingga tengah malam KL (untuk cache respons "hari ini").
function secsToMidnightKL() {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t) => +p.find((x) => x.type === t).value;
  return 86400 - (g("hour") * 3600 + g("minute") * 60 + g("second"));
}

// Cache ikut jenis respons:
//  - ?now            -> berubah setiap minit: cache 30s sahaja
//  - ?today / default -> sah sampai tengah malam KL sahaja (maks 1 jam), tiada stale
//  - ?date/?month/julat -> data tetap: cache lama
function cacheHeader(q) {
  if ("now" in q) return "public, s-maxage=30";
  if ("today" in q || !(q.date || q.month || q.from || q.to)) {
    return `public, s-maxage=${Math.max(1, Math.min(3600, secsToMidnightKL()))}`;
  }
  return "public, s-maxage=86400, stale-while-revalidate=604800";
}

// --- handler -------------------------------------------------------------

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheHeader(req.query || {}));
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = req.query || {};
  const send = (code, body) => res.status(code).send(JSON.stringify(body, null, 2));
  const D = (day) => transform(day, q);

  try {
    if ("now" in q) {
      const date = todayKL();
      const day = byDate[date];
      if (!day) return send(404, { error: "Tarikh di luar julat data", date, ...meta(q, date) });
      const row = D(day);
      return send(200, { ...meta(q, date), date, times: row, ...computeNow(row, nowMinutesKL()), ...hijriPair(day) });
    }

    if ("today" in q) {
      const date = todayKL();
      const day = byDate[date];
      if (!day) return send(404, { error: "Tarikh di luar julat data", date, ...meta(q, date) });
      return send(200, { ...meta(q, date), date, times: D(day), ...hijriPair(day) });
    }

    if (q.month) {
      const mm = String(q.month).padStart(2, "0");
      const yy = String(q.year || todayKL().slice(0, 4));
      const days = DB.days.filter((d) => d.date.slice(0, 7) === `${yy}-${mm}`).map(D);
      if (!days.length) return send(400, { error: `Bulan/tahun tak sah (bulan 01-12, tahun ${RANGE_TXT})`, got: { month: q.month, year: yy } });
      return send(200, { ...meta(q, `${yy}-${mm}-01`), year: +yy, month: mm, count: days.length, days });
    }

    if (q.from || q.to) {
      const from = q.from || DB.days[0].date;
      const to = q.to || DB.days[DB.days.length - 1].date;
      const days = DB.days.filter((d) => d.date >= from && d.date <= to).map(D);
      return send(200, { ...meta(q, from), from, to, count: days.length, days });
    }

    const date = q.date || todayKL();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return send(400, { error: "Format tarikh salah. Guna YYYY-MM-DD", got: date });
    }
    const day = byDate[date];
    if (!day) return send(404, { error: `Tarikh di luar julat data (${RANGE_TXT})`, date, ...meta(q, date) });
    return send(200, { ...meta(q, date), date, times: D(day), ...hijriPair(day) });
  } catch (e) {
    return send(500, { error: "Ralat dalaman", detail: String(e) });
  }
};
