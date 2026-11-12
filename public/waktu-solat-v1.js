/*!
 * WaktuSolat v1: helper kongsi untuk API waktu solat SGR03 / Daerah Kuala Langat.
 * Guna:  <script src="https://apiwaktusolatsgr03.vercel.app/waktu-solat-v1.js"></script>
 *
 * Peraturan v1 (jangan pecahkan; perubahan besar = buat v2):
 *  - month(tahun, bulan): tahun WAJIB.
 *  - Label & sumber ambil dari data (label(), source()), jangan hardcode.
 *  - Data ikut tarikh disimpan dalam localStorage (data tarikh tak berubah), jadi
 *    app masih boleh papar waktu bila internet putus.
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var PROD = 'https://apiwaktusolatsgr03.vercel.app';
  var TZ = 'Asia/Kuala_Lumpur';
  var ORDER = ['imsak', 'subuh', 'syuruk', 'dhuha', 'zohor', 'asar', 'maghrib', 'isyak'];
  var NAMES = { imsak: 'Imsak', subuh: 'Subuh', syuruk: 'Syuruk', dhuha: 'Dhuha', zohor: 'Zohor', asar: 'Asar', maghrib: 'Maghrib', isyak: 'Isyak' };
  var HIJRI_MONTHS = { Muh: 'Muharram', Saf: 'Safar', Raw: 'Rabiulawal', Rak: 'Rabiulakhir', Jaw: 'Jamadilawal', Jak: 'Jamadilakhir', Rej: 'Rejab', Syb: 'Syaaban', Ram: 'Ramadan', Syw: 'Syawal', Zkh: 'Zulkaedah', Zhj: 'Zulhijjah' };
  var CACHE_PREFIX = 'ws1:';

  // API ikut domain skrip ni dimuatkan (preview deploy pun jalan), kalau tak, guna production.
  var BASE = PROD;
  try {
    var s = root.document && root.document.currentScript;
    if (s && s.src) BASE = new URL(s.src).origin;
  } catch (e) { /* kekal PROD */ }
  var ENDPOINT = BASE + '/api/waktu-solat';

  var memo = {};

  function pad(n) { return String(n).padStart(2, '0'); }
  function isDate(str) { return /^\d{4}-\d{2}-\d{2}$/.test(str); }

  // Tarikh hari ini di Malaysia (bukan ikut zon peranti), "YYYY-MM-DD"
  function todayKey(now) {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now || new Date());
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    return o.year + '-' + o.month + '-' + o.day;
  }

  function addDays(key, n) {
    var d = new Date(key + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function qs(params) {
    return Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== false; })
      .map(function (k) { return params[k] === true ? encodeURIComponent(k) : encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
  }

  function get(params) {
    return root.fetch(ENDPOINT + '?' + qs(params)).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error(j && j.error ? j.error : 'HTTP ' + r.status); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    });
  }

  function cacheRead(k) {
    try { var raw = root.localStorage.getItem(CACHE_PREFIX + k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function cacheWrite(k, v) {
    try { root.localStorage.setItem(CACHE_PREFIX + k, JSON.stringify(v)); } catch (e) { /* storage penuh / disekat */ }
  }

  // ── Ambil data ──────────────────────────────────────────────

  // Satu tarikh. opts: { adjust: 'jugra' } dsb. (diteruskan ke API)
  function date(key, opts) {
    if (!isDate(key)) return Promise.reject(new Error('Format tarikh mesti YYYY-MM-DD, dapat: ' + key));
    var params = Object.assign({ date: key }, opts || {});
    var ck = qs(params);
    if (memo[ck]) return memo[ck];
    var p = get(params).then(function (j) { cacheWrite(ck, j); return j; }).catch(function (e) {
      var c = cacheRead(ck);
      if (c && !e.status) return c; // offline → guna salinan simpanan
      delete memo[ck];
      throw e;
    });
    memo[ck] = p;
    return p;
  }

  function today(opts) { return date(todayKey(), opts); }
  function tomorrow(opts) { return date(addDays(todayKey(), 1), opts); }

  // Sebulan. Tahun WAJIB, supaya poster Januari tahun depan tak tertarik tahun semasa.
  function month(year, mon, opts) {
    year = Number(year); mon = Number(mon);
    if (!year || year < 2000) return Promise.reject(new Error('WaktuSolat.month(tahun, bulan): tahun wajib, cth month(2027, 1)'));
    if (!(mon >= 1 && mon <= 12)) return Promise.reject(new Error('WaktuSolat.month: bulan mesti 1-12'));
    return get(Object.assign({ month: pad(mon), year: year }, opts || {}));
  }

  function range(from, to, opts) {
    if (!isDate(from) || !isDate(to)) return Promise.reject(new Error('WaktuSolat.range(from, to): format YYYY-MM-DD'));
    return get(Object.assign({ from: from, to: to }, opts || {}));
  }

  // ── Bantuan paparan ────────────────────────────────────────

  // Label kawasan ikut tahun data (2026: "Klang, Kuala Langat", 2027: "Daerah Kuala Langat")
  function label(data) { return (data && (data.zone_name || data.location)) || ''; }
  // Sumber rasmi ikut tahun data
  function source(data) { return (data && data.source) || ''; }

  // "HH:MM" pada tarikh "YYYY-MM-DD" → Date (masa Malaysia, UTC+8 tetap)
  function at(key, hhmm) {
    return new Date(key + 'T' + hhmm + ':00+08:00');
  }

  // Baris waktu (data.times atau satu item days[]) → { imsak: Date, ... }
  function toDates(row) {
    var out = {};
    ORDER.forEach(function (k) { if (row && row[k]) out[k] = at(row.date, row[k]); });
    return out;
  }

  // "22-Rej-1448" → { day, month, month_abbr, year, formatted }
  function parseHijri(raw) {
    var m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw || '');
    if (!m) return null;
    var name = HIJRI_MONTHS[m[2]] || m[2];
    return { day: +m[1], month: name, month_abbr: m[2], year: +m[3], formatted: +m[1] + ' ' + name + ' ' + m[3] + 'H' };
  }

  // Hijri yang patut dipapar sekarang (bertukar selepas Maghrib)
  function hijriNow(data, now) {
    now = now || new Date();
    var t = data && data.times;
    if (!t) return null;
    var afterMaghrib = now >= at(t.date, t.maghrib);
    return afterMaghrib ? data.hijri_maghrib : data.hijri_today;
  }

  // 12 jam: "05:38 AM"
  function fmt12(d) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    var h = +o.hour % 24;
    return pad(h % 12 || 12) + ':' + o.minute + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  // Waktu seterusnya, termasuk Imsak esok selepas Isyak.
  // → { key, name, time: Date, isTomorrow, today: data }
  function next(opts, now) {
    now = now || new Date();
    return date(todayKey(now), opts).then(function (d) {
      var dates = toDates(d.times);
      for (var i = 0; i < ORDER.length; i++) {
        var k = ORDER[i];
        if (dates[k] > now) return { key: k, name: NAMES[k], time: dates[k], prev: i ? dates[ORDER[i - 1]] : null, isTomorrow: false, today: d };
      }
      return date(addDays(todayKey(now), 1), opts).then(function (t) {
        return { key: 'imsak', name: NAMES.imsak, time: at(t.times.date, t.times.imsak), prev: dates.isyak, isTomorrow: true, today: d };
      });
    });
  }

  root.WaktuSolat = {
    VERSION: VERSION, ENDPOINT: ENDPOINT, ORDER: ORDER, NAMES: NAMES,
    today: today, tomorrow: tomorrow, date: date, month: month, range: range, next: next,
    label: label, source: source, toDates: toDates, at: at,
    parseHijri: parseHijri, hijriNow: hijriNow, fmt12: fmt12,
    todayKey: todayKey, addDays: addDays
  };
})(typeof window !== 'undefined' ? window : globalThis);
