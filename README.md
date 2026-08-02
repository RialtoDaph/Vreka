# Vreka

Personal command center — keuangan, kerjaan, dan pelajaran dalam satu dashboard.

Dibangun dengan Next.js (App Router) + Supabase + Tailwind CSS.

## Setup

1. Copy `.env.example` ke `.env.local` dan isi kredensial Supabase + Anthropic +
   ElevenLabs kamu (ElevenLabs opsional, cuma dipakai buat mode suara di Aslan).
2. `npm install`
3. `npm run dev`

## Development

- `npm run lint` — ESLint (flat config, `eslint-config-next`).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run test` — Vitest, unit test buat logic murni (`lib/format.ts`,
  `lib/categories.ts`, dst). Ditambah bertahap seiring modul baru masuk.
- CI (`.github/workflows/ci.yml`) jalanin ketiganya di tiap push/PR.
- `supabase/migrations/` — snapshot skema DB versioned sebagai SQL, biar
  reproducible di project Supabase baru (bukan buat di-apply ulang ke project
  produksi yang udah jalan — tabelnya udah ada di sana). Perubahan skema
  berikutnya ditambah sebagai file migration baru bernomor urut.

## Deploy

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`ANTHROPIC_API_KEY`, dan (opsional, buat mode suara) `ELEVENLABS_API_KEY` /
`ELEVENLABS_VOICE_ID` di environment variables Vercel. Semua key AI itu
cuma dipakai server-side (route `/api/assistant/*`), jangan pernah ditaruh di
env var yang di-prefix `NEXT_PUBLIC_`. Env var yang ditambah setelah deploy
nggak berlaku surut — harus ada build baru buat kepake.

Di Supabase (Authentication → URL Configuration), **Site URL** harus diarahkan ke
domain produksi, bukan `http://localhost:3000` bawaannya, dan `/auth/callback`
harus masuk daftar Redirect URLs — kalau nggak, link konfirmasi email bakal
nembak localhost.

## Gmail & Google Calendar (opsional — biar Aslan bisa cek/bales email dan liat/bikin jadwal)

Satu koneksi Google yang sama dipake buat Gmail dan Calendar (satu tombol
**Connect Gmail**, satu baris di tabel `google_credentials`).

1. **Google Cloud Console** (console.cloud.google.com):
   - Bikin project baru.
   - APIs & Services → Library → enable **Gmail API** dan **Google Calendar API**.
   - APIs & Services → OAuth consent screen → User type **External**, tambahin
     scope `gmail.readonly` + `gmail.compose` + `calendar.readonly` +
     `calendar.events`, dan tambahin akun Gmail kamu sendiri sebagai
     **Test user** (biar nggak perlu proses verifikasi Google).
   - APIs & Services → Credentials → Create Credentials → **OAuth client ID**,
     tipe **Web application**. Authorized redirect URI-nya:
     ```
     https://<domain-produksi-vreka-kamu>/api/google/oauth/callback
     ```
     (bukan URL Supabase — ini callback punya Vreka sendiri, soalnya integrasi
     Gmail-nya dipisah dari login, biar akun yang udah ada nggak kesenggol.)
   - Copy **Client ID** dan **Client Secret**.
2. Set di Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
3. Set `SUPABASE_SERVICE_ROLE_KEY` di Vercel — ambil dari Supabase Dashboard →
   Project Settings → API → **service_role** secret. Ini kunci admin yang
   bypass semua RLS, cuma dipakai server-side di route cron harian; jangan
   pernah expose ke client.
4. Set `CRON_SECRET` di Vercel (string acak bebas) — Vercel otomatis kirim ini
   sebagai header pas motoran cron job-nya, dipakai buat mastiin cuma Vercel
   yang bisa manggil endpoint cron harian.
5. Redeploy, lalu buka halaman **Aslan** → klik **Connect Gmail**.

Setelah connect, Aslan bisa cari/baca email dan bikin **draft balesan** (nggak
pernah auto-kirim), liat jadwal dan bikinin event di Google Calendar pas
diminta lewat chat, plus dapet ringkasan email belum dibaca otomatis sekali
sehari (`vercel.json` — jadwal `0 7 * * *` UTC; di Vercel Hobby plan, cron
cuma bisa jalan maksimal sekali sehari).

**Udah connect Gmail sebelum fitur Calendar ini ada?** Refresh token lama
cuma punya izin Gmail — disconnect dulu (tombol di halaman Aslan) terus
connect ulang biar izin Calendar-nya ikut ke-grant.

## Telegram (opsional — biar bisa chat Aslan langsung dari Telegram)

1. Buka Telegram, chat **@BotFather** → `/newbot` → ikutin instruksinya (kasih
   nama tampilan, terus username unik yang harus diakhiri `bot`, misal
   `AslanVrekaBot`). BotFather bakal balesin sebuah **HTTP API token**.
2. Set di Vercel:
   - `TELEGRAM_BOT_TOKEN` — token dari BotFather.
   - `TELEGRAM_BOT_USERNAME` — username bot-nya (tanpa `@`).
   - `TELEGRAM_WEBHOOK_SECRET` — string acak bebas bikinan kamu sendiri
     (bukan dari Telegram), dipakai buat mastiin webhook request beneran
     dari Telegram, bukan orang lain.
3. `SUPABASE_SERVICE_ROLE_KEY` juga wajib di-set (lihat bagian Gmail di atas
   kalau belum) — dipakai buat balesin chat dari Telegram karena nggak ada
   sesi login Supabase di situ.
4. Redeploy, lalu — sambil login ke Vreka di browser — buka
   `https://<domain-produksi-vreka-kamu>/api/telegram/setup` sekali buat
   ndaftarin webhook-nya ke Telegram. Aman dipanggil berkali-kali.
5. Buka halaman **Aslan** → klik **Connect Telegram** → bakal kebuka Telegram
   dan otomatis nyambungin akun Telegram kamu ke akun Vreka kamu.

Setelah connect, chat teks apa aja ke bot-nya bakal langsung dibales Aslan,
dengan akses yang sama kayak di dashboard (nyatet transaksi, nambah to-do,
liat kondisi keuangan, dll), plus dapet **morning briefing** otomatis sekali
sehari (saldo, tugas due/telat hari ini, anggaran yang mepet, kebiasaan yang
belum dicentang, dan jadwal Calendar kalau udah connect) — jadwalnya nebeng
di cron yang sama dengan digest email (`/api/cron/daily-digest`, `0 7 * * *` UTC).

## Modul

- **Keuangan** — transaksi (pemasukan/pengeluaran), pos tetap (manual atau
  auto-post tanggal tertentu tiap bulan lewat cron harian), utang/piutang,
  target tabungan, anggaran bulanan per kategori, dan tab Analitik (grafik
  tren & breakdown kategori)
- **Kerjaan** — to-do dengan deadline & prioritas, papan Kanban (To-do/In
  Progress/Selesai) plus sub-task per to-do, tag project buat filter, dan
  pelacak kebiasaan harian (streak)
- **Pelajaran** — catatan + progress tracker, mode kuis (Aslan bikin soal
  pilihan ganda dari isi catatan buat self-test, skornya bisa langsung
  diangkat jadi progress), timer sesi belajar, dan lampiran resource (link)
  per catatan
- **Kalender** — tampilan bulanan yang gabungin deadline to-do, jatuh tempo
  utang, deadline target tabungan, dan (kalau Google Calendar di-connect)
  jadwal Calendar, semua dalam satu grid
- **Jurnal** — catatan harian freeform dengan prompt refleksi yang beda tiap
  hari, satu entry per hari
- **Aslan** — asisten AI personal (Claude, model bisa dipilih) yang tau kondisi
  keuangan/kerjaan/pelajaran kamu, bisa dicatetin transaksi/to-do/catatan lewat
  chat, nyimpen memory jangka panjang soal kamu, punya mode telepon hands-free
  dengan barge-in (lewat ElevenLabs) kalau `ELEVENLABS_API_KEY` di-set, kalau
  Gmail di-connect bisa cari/baca email, bikin draft balesan, liat/bikin event
  Google Calendar, plus ringkasan email belum dibaca otomatis sekali sehari,
  kalau Telegram di-connect bisa diajak chat langsung dari Telegram dan dapet
  morning briefing harian, dan tiap aksi yang diambil Aslan (nyatet transaksi,
  ubah data, dst) tercatat di log Aktivitas (halaman Aslan) buat transparansi
