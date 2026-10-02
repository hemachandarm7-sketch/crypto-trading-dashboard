# Crypto Trading Dashboard

**A modern workspace for crypto trade management, screenshot organization, analytics, and performance tracking.**

> Trade and screenshot records are stored in Supabase. No live exchange prices or exchange API is connected.

## Features

- Dark-first, responsive trading-terminal layout with Dashboard, Trades, Open Positions, Upload Screenshot, Analytics, and Settings sections.
- Portfolio summary, equity curve, recent trades, active positions, and win/loss snapshot.
- Supabase-backed trade journal with create, edit, delete, search, and status filtering.
- Open-position tracking with values from uploaded position screenshots (no live price feed).
- Screenshot uploads use private Supabase Storage, hash deduplication, OCR review, and trade association.
- Analytics for realized P&L, win rate, profit factor, drawdown, direction, and coin performance.
- Supabase PostgreSQL with row-level security and persistent email/password accounts for cross-device access. Existing anonymous workspaces can be upgraded in place from Settings so their trades retain the same Supabase owner ID. Tesseract.js performs English OCR in the browser. There is no exchange API, live pricing, or AI analysis.

## Screenshots

Screenshots will be added here after a product capture is available.

## Tech stack

- React 18 + TypeScript
- Vite
- Tailwind CSS (base utilities ready) and custom responsive component styles
- Recharts
- Lucide React
- ESLint and Prettier

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Installation

```bash
git clone https://github.com/hemachandarm7-sketch/crypto-trading-dashboard.git
cd crypto-trading-dashboard
npm install
```

## Development

```bash
npm run dev
```

Vite prints the local URL (typically `http://localhost:5173`). Configure a root `.env` from `.env.example` with the Supabase project URL and publishable key. Apply the SQL migrations in order. In Supabase Auth, enable email signups/passwords and email confirmation, and add `http://localhost:5173/**` plus the production URL to the redirect allow list. Keep manual identity linking enabled for upgrading older anonymous workspaces. To preserve trades already saved on a phone, open Settings on that phone, link the current workspace to an email, verify that email on the same device, then return to Settings and set a password. This upgrades the existing Supabase user in place; it does not copy or reassign the trade rows. On other devices, sign in with that email and password. A clean browser can create a new account from the sign-in screen. The project URL must not include `/rest/v1`. Screenshot OCR runs in the browser. The worker is bundled with the app; Tesseract downloads its English model (and WASM core) from its public CDN on first use.

## Deploy to Vercel

Import `hemachandarm7-sketch/crypto-trading-dashboard` from GitHub in Vercel. Use the Vite preset (or configure the project root), with `npm install` as the install command, `npm run build` as the build command, and `dist` as the output directory. Add these environment variables for Production and Preview:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Use the Supabase project URL and publishable/anon key only. Never add the service-role key. Apply all SQL migrations, enable email/password signups and email confirmation in Supabase Auth, allow manual identity linking for legacy anonymous accounts, and add the local and production app URLs to the Auth redirect allow list. `006_enable_workspace_realtime.sql` enables realtime table publication; focus, network reconnect, page navigation, and periodic revalidation still refresh data if publication has not yet been enabled. Browser OCR uses Tesseract.js and needs no OCR API key; first use downloads the English model and WASM core from the public CDN. `vercel.json` provides SPA route fallback.

## Build and checks

```bash
npm run build
npm run lint
npm run preview
```

## Project structure

```text
src/
  App.tsx                 Navigation, pages, and reusable UI
  main.tsx                React entry point
  styles.css              Responsive trading-terminal design system
  services/
    analytics.ts          P&L and performance calculations
    screenshotTextParser.ts OCR text normalization
    tradeRepository.ts    Supabase CRUD and screenshot storage
    tradeMatchingService.ts Open/position/close matching
    screenshotExtractionService.ts OCR provider and trade lifecycle
  types/
    index.ts              Trade, position, screenshot, analytics, and settings types
index.html
vite.config.ts
tailwind.config.js
postcss.config.js
eslint.config.js
tsconfig*.json
```

## Architecture

The UI uses a Supabase repository for trades, settings, screenshot metadata, and lifecycle events. Tesseract.js recognizes English text in the browser behind a replaceable OCR provider interface. Extraction is shown with raw OCR and normalized fields in a review form; trade matching and database updates happen after confirmation. Pending Open events can be paired with later position details, while a Close event updates the active trade.

## Roadmap

1. Improve OCR coverage for more exchange layouts and add review for low-confidence results.
2. Add user-configurable account profiles and import/export.
3. Add opt-in exchange integrations and verified market prices.

## License

MIT. See [LICENSE](./LICENSE).
