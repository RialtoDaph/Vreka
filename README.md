# Vreka

Personal command center — keuangan, kerjaan, dan pelajaran dalam satu dashboard.

Dibangun dengan Next.js (App Router) + Supabase + Tailwind CSS.

## Setup

1. Copy `.env.example` ke `.env.local` dan isi kredensial Supabase + Anthropic +
   ElevenLabs kamu (ElevenLabs opsional, cuma dipakai buat mode suara di Asisten).
2. `npm install`
3. `npm run dev`

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

## Modul

- **Keuangan** — transaksi (pemasukan/pengeluaran), utang/piutang, target tabungan
- **Kerjaan** — to-do dengan deadline & prioritas
- **Pelajaran** — catatan + progress tracker
- **Asisten** — asisten AI personal (Claude, model bisa dipilih) yang tau kondisi
  keuangan/kerjaan/pelajaran kamu, bisa dicatetin transaksi/to-do/catatan lewat
  chat, nyimpen memory jangka panjang soal kamu, dan punya mode ngobrol pakai
  suara (push-to-talk, lewat ElevenLabs) kalau `ELEVENLABS_API_KEY` di-set
