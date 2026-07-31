# Vreka

Personal command center — keuangan, kerjaan, dan pelajaran dalam satu dashboard.

Dibangun dengan Next.js (App Router) + Supabase + Tailwind CSS.

## Setup

1. Copy `.env.example` ke `.env.local` dan isi kredensial Supabase + Anthropic kamu.
2. `npm install`
3. `npm run dev`

## Deploy

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan
`ANTHROPIC_API_KEY` di environment variables Vercel. `ANTHROPIC_API_KEY` cuma
dipakai server-side (route `/api/assistant/chat`), jangan pernah ditaruh di
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
- **Asisten** — asisten AI personal (Claude) yang tau kondisi keuangan/kerjaan/
  pelajaran kamu, bisa dicatetin transaksi/to-do/catatan lewat chat, dan
  nyimpen memory jangka panjang soal kamu
