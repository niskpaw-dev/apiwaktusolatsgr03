# Waktu Solat API — Zon SGR03

API waktu solat self-hosted untuk **Zon SGR03 (Klang, Kuala Langat), Selangor**.
Data rasmi, 365 hari setahun, di-parse terus dari PDF tahunan:
- **2026** — JAKIM e-Solat (Zon SGR03)
- **2027** — Takwim Waktu Solat Jabatan Mufti Negeri Selangor (Daerah Kuala Langat)

**8 waktu:** Imsak · Subuh · Syuruk · Dhuha · Zohor · Asar · Maghrib · Isyak.
- **Imsak** — dari data JAKIM (Subuh − 10 min).
- **Dhuha** — dikira: Syuruk + ⅓ × (Syuruk − Subuh) (**formula falak**, padan jadual rujukan).
  Alternatif ketetapan Mufti Selangor (Syuruk + 25 min, +1 min lebih lewat): `?dhuha=offset&dhuha_offset=25`.
- **Pelarasan Puncak Bukit Jugra** (`?adjust=jugra`): Syuruk −1, Maghrib +1
  (Dhuha turut beralih sebab dikira dari Syuruk). Relevan untuk kawasan Kuala Langat.

Kenapa self-host (bukan call e-Solat live)?
- **Offline-resilient** — takde dependency pada uptime/CORS/rate-limit JAKIM.
- **Laju & percuma** — fail statik, di-cache di edge Vercel.
- **Satu sumber** untuk semua projek (overlay masjid, PWA tasbih, dashboard).

---

## Struktur

```
waktu-solat-api/
├── api/
│   ├── waktu-solat.js          # serverless function (CommonJS)
│   └── _data/sgr03-2026.json   # dataset 2026 (folder _ = bukan route)
│   └── _data/sgr03-2027.json   # dataset 2027
├── public/index.html           # demo widget (live countdown)
├── public/waktu-solat-v1.js    # helper kongsi untuk semua app (lihat bawah)
├── test/contract.js            # ujian kontrak — `npm test` sebelum push
├── vercel.json
└── package.json
```

## Deploy (Vercel)

```bash
cd waktu-solat-api
vercel            # atau push ke GitHub & import di vercel.com
```

Lepas deploy:
- `https://<projek>.vercel.app/`               → demo widget
- `https://<projek>.vercel.app/api/waktu-solat` → API

> Awak dah ada Vercel connector — boleh deploy terus dari chat kalau nak.

---

## Endpoint

`GET /api/waktu-solat`

| Param | Contoh | Hasil |
|---|---|---|
| _(takde)_ | `/api/waktu-solat` | Waktu hari ini |
| `today` | `?today` | Waktu hari ini |
| `now` | `?now` | Hari ini + waktu **semasa & seterusnya** + countdown |
| `date` | `?date=2026-06-15` | Satu tarikh tertentu |
| `month` (+ `year`) | `?month=06&year=2027` | Sebulan penuh (`year` default = tahun semasa) |
| `from` / `to` | `?from=2026-06-01&to=2026-06-10` | Julat tarikh |
| `adjust` | `?adjust=jugra` | Pelarasan Puncak Bukit Jugra (Syuruk −1, Maghrib +1) |
| `dhuha` | `?dhuha=offset&dhuha_offset=25` | Kira Dhuha guna offset tetap (cth +25 = ketetapan Mufti) |

Semua param boleh **digabung**, cth: `?now&adjust=jugra` atau `?month=06&adjust=jugra`.

**Kaedah Dhuha:**
- _(default)_ — Syuruk + ⅓ × (Syuruk − Subuh) — formula falak (padan jadual rujukan)
- `?dhuha=offset&dhuha_offset=25` — Syuruk + 25 min (ketetapan Mufti Selangor)
- `?dhuha=offset&dhuha_offset=N` — Syuruk + N minit (nilai lain)

> Nak jadikan pelarasan Jugra sebagai **default** untuk deploy masjid awak: set
> `DEFAULT_ADJUST = "jugra"` dalam `api/waktu-solat.js`.

Semua masa dalam format **24-jam `HH:MM`**, zon waktu `Asia/Kuala_Lumpur`.
CORS dibuka (`*`) — boleh call dari mana-mana frontend.

### Contoh respons `?now`

```json
{
  "zone": "SGR03",
  "zone_name": "Klang, Kuala Langat",
  "state": "Selangor",
  "date": "2026-06-01",
  "times": {
    "date": "2026-06-01", "hijri": "15-Zhj-1447", "day": "Isnin",
    "imsak": "05:40", "subuh": "05:50", "syuruk": "07:03", "dhuha": "07:27",
    "zohor": "13:14", "asar": "16:39", "maghrib": "19:22", "isyak": "20:37"
  },
  "current": { "prayer": "subuh", "name": "Subuh", "time": "05:50" },
  "next":    { "prayer": "syuruk", "name": "Syuruk", "time": "07:03" },
  "minutes_to_next": 61,
  "countdown": "01:01"
}
```

---

## Panduan Guna API (copy-paste ke chat projek baru)

Setiap kali mula projek baru yang guna waktu solat, tampal blok ni ke chat projek tu:

```
PANDUAN API WAKTU SOLAT (Niskala Pawaka Dev)
Sumber tunggal: https://apiwaktusolatsgr03.vercel.app/api/waktu-solat
(2026 JAKIM e-Solat SGR03 · 2027+ Takwim Mufti Selangor, Daerah Kuala Langat)

1. Guna helper, jangan tulis fetch sendiri:
   <script src="https://apiwaktusolatsgr03.vercel.app/waktu-solat-v1.js"></script>
   WaktuSolat.today() / .tomorrow() / .date('2027-01-01')   → { times, hijri_today, hijri_maghrib, zone_name, source, ... }
   WaktuSolat.month(2027, 1)        → { days: [...] }   (TAHUN WAJIB)
   WaktuSolat.next()                → { key, name, time: Date, isTomorrow }  (termasuk Imsak esok selepas Isyak)
   WaktuSolat.toDates(data.times)   → { imsak: Date, ... }  (masa Malaysia)
   WaktuSolat.hijriNow(data)        → Hijri yang betul (bertukar selepas Maghrib)
   WaktuSolat.label(data), WaktuSolat.source(data), WaktuSolat.fmt12(date)
   WaktuSolat.source(data, { short: true })  → sumber pendek untuk footer/poster (atau terus data.source_short)
2. JANGAN hardcode label kawasan ("Zon SGR03") atau sumber ("JAKIM e-Solat").
   Ambil dari WaktuSolat.label(data) dan WaktuSolat.source(data); ia bertukar ikut tahun.
   Untuk ruang sempit, guna source_short (2026: "JAKIM e-Solat", 2027: "Jabatan Mufti Negeri Selangor"); jangan potong sendiri.
3. Kalau terpaksa guna fetch terus: ?month WAJIB dengan &year=. ?today / ?now / ?date=YYYY-MM-DD selamat.
4. Masa dalam HH:MM 24 jam. Hijri mentah "22-Rej-1448"; guna hijri_today / hijri_maghrib (.formatted) untuk paparan.
5. Jangan anggap struktur respons akan berubah; ia dikunci oleh ujian kontrak. Perubahan besar = helper v2.
```

## Helper `waktu-solat-v1.js`

Satu fail JS kecil (tanpa dependency) yang dihidang oleh API ni sendiri. Semua logik yang
selalu jadi punca bug duduk di sini: tarikh Malaysia, Imsak esok selepas Isyak, Hijri selepas
Maghrib, tahun wajib untuk bulan, label & sumber ikut tahun.

```html
<script src="https://apiwaktusolatsgr03.vercel.app/waktu-solat-v1.js"></script>
<script>
  WaktuSolat.today().then((d) => {
    const t = WaktuSolat.toDates(d.times);
    console.log(WaktuSolat.label(d), WaktuSolat.fmt12(t.subuh), WaktuSolat.hijriNow(d).formatted);
  });
  WaktuSolat.next().then((n) => console.log(n.name, n.time, n.isTomorrow));
  WaktuSolat.month(2027, 1).then((m) => console.log(m.days.length, WaktuSolat.source(m)));
</script>
```

- Data ikut tarikh disimpan dalam `localStorage` (data satu tarikh tak berubah), jadi app
  masih boleh papar waktu bila internet putus, asalkan tarikh tu pernah dimuat.
- Pilihan API boleh dihantar: `WaktuSolat.today({ adjust: 'jugra' })`.
- **Versi:** `v1` tak akan diubah dengan cara yang memecahkan app. Perubahan besar = fail baru
  `waktu-solat-v2.js`; app lama terus guna `v1`.

## Ujian kontrak

```bash
npm test     # node test/contract.js
```

Semak setiap medan yang app guna masih wujud dan formatnya sama, setiap hari setiap tahun
lengkap dan waktunya tersusun (Imsak < Subuh < … < Isyak), dan helper v1 berkelakuan betul
(termasuk Imsak esok pada 31 Dis). **Kalau gagal, jangan push**: perubahan tu akan pecahkan app lain.

---

## Guna dalam frontend

### Vanilla JS
```js
const r = await fetch("https://<projek>.vercel.app/api/waktu-solat?now");
const d = await r.json();
console.log(d.next.name, d.countdown); // "Syuruk", "01:01"
```

### React hook
```jsx
import { useEffect, useState } from "react";

export function useWaktuSolat() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const load = () =>
      fetch("https://<projek>.vercel.app/api/waktu-solat?now")
        .then((r) => r.json()).then(setData);
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);
  return data;
}
```

### Mod offline penuh
Untuk PWA/overlay yang mesti jalan tanpa internet, import terus dataset
`api/_data/sgr03-2026.json` ke dalam projek dan tapis ikut `date` di client —
takde network call langsung.

---

## Update tahun depan
Setiap tahun = satu fail; data tahun lama boleh kekal (peralihan 31 Dis → 1 Jan lancar).
1. Parse PDF tahun baru → `api/_data/sgr03-YYYY.json` (struktur sama, termasuk `zone_name`, `source` & `source_short`).
2. Tambah satu baris dalam `DATASETS` di `api/waktu-solat.js`.
3. `npm test` → mesti lulus (ia uji tahun baru secara automatik).
4. Push → Vercel auto-deploy. Semua app pengguna tak perlu disentuh.

_Sumber: JAKIM e-Solat (2026) · Jabatan Mufti Negeri Selangor (2027)._
