# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start local dev server (Next.js)
npm run build        # Production build
npm run lint         # ESLint (flat config via eslint.config.mjs)
npm run typecheck    # tsc --noEmit
npm run test         # Vitest (all *.test.ts / *.test.tsx)
```

Run a single test file:
```bash
npx vitest run lib/format.test.ts
```

## Architecture

**Stack:** Next.js 16 App Router + Supabase (Postgres + Auth) + Tailwind CSS + TypeScript. Deployed on Vercel. Error tracking via Sentry (optional, no-op when env vars are absent).

**Auth:** Supabase Auth with SSR cookies (`@supabase/ssr`). Three Supabase client flavors:
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — server components / route handlers (cookie-based)
- `lib/supabase/admin.ts` — service-role client (bypasses RLS), used only in cron and Telegram webhook routes

**Route structure:**
- `app/(auth)/` — login, MFA pages (unauthenticated)
- `app/dashboard/(chrome)/` — all authenticated modules behind the AppChrome shell (Sidebar + BottomNav). Modules: `ringkasan`, `keuangan`, `kerjaan`, `canvas`, `pelajaran`, `kalender`, `jurnal`, `timeline`, `asisten`, `ai-core`
- `app/api/` — API routes: `assistant/*` (Claude tool-calling), `cron/` (daily digest), `google/`, `telegram/`, `push/`, `search/`, `keuangan/`, etc.

**Core lib files:**
- `lib/types.ts` — all shared TypeScript types (Transaction, Debt, Todo, etc.)
- `lib/navModules.ts` — single source of truth for nav items (used by both Sidebar and CommandPalette)
- `lib/supabase/` — Supabase client factories
- `lib/exportableTables.ts` — tables included in the JSON data export

**AI (Aslan):** Claude powers the chat assistant via `app/api/assistant/chat/`. Tool-calling lets Aslan read/write all user data. Model tier is user-selectable (Haiku/Sonnet/Opus). Optional ElevenLabs TTS/STT for phone mode, OpenAI Realtime API for the Memory Map ⚡ button. Gmail and Google Calendar are connected via a single OAuth flow (`app/api/google/`), storing tokens in `google_credentials` table.

**Components:** Organized by module under `components/` — `components/keuangan/`, `components/kerjaan/`, `components/pelajaran/`, `components/asisten/`. Shared UI components live directly in `components/` (AppChrome, CommandPalette, ConfirmDialog, etc.).

**Tests:** Vitest with `jsdom` for React component tests, `node` environment for pure logic. Tests live alongside source files (`*.test.ts` / `*.test.tsx`). Focus is on pure logic modules in `lib/`.

**Database migrations:** `supabase/migrations/` contains versioned SQL snapshots. These are for bootstrapping a new Supabase project — **not** for re-applying to the existing production project. New schema changes get a new sequentially-numbered migration file.

**Cron:** `vercel.json` defines a daily cron at `0 7 * * *` UTC hitting `/api/cron/daily-digest`. Secured via `CRON_SECRET` header.

**Push notifications:** VAPID-based web push via `web-push`. Subscriptions stored in `push_subscriptions` table.

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project
- `ANTHROPIC_API_KEY` — Claude (server-side only, never `NEXT_PUBLIC_`)
- `SUPABASE_SERVICE_ROLE_KEY` — admin client (server-side only)

Optional features:
- `ELEVENLABS_API_KEY` — TTS/STT phone mode in Aslan
- `OPENAI_API_KEY` — Memory Map realtime voice (⚡ button)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Gmail + Calendar integration
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` — Telegram bot
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` — push notifications
- `CRON_SECRET` — protect cron endpoint
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` — error tracking
