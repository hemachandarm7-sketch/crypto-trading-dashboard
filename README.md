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
- Supabase PostgreSQL with row-level security. A new browser starts with an anonymous workspace; link its owner to an email in Settings to use that same protected workspace across devices. Tesseract.js performs English OCR in the browser. There is no exchange API, live pricing, or AI analysis.

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

Vite prints the local URL (typically `http://localhost:5173`). Configure a root .env from .env.example with the Supabase project URL and publishable key. Apply the SQL migrations in order and enable anonymous sign-ins plus manual identity linking in Supabase Auth. To share data across devices, first open Settings on the device that already owns the trades, link its current workspace to an email, and confirm the email there. Then use that email's sign-in link on other devices. This preserves the existing user ID and its RLS-owned rows. The project URL must not include /rest/v1. Screenshot OCR runs in the browser. The worker is bundled with the app; Tesseract downloads its English model (and WASM core) from its public CDN on first use.

## Deploy to Vercel

Import `hemachandarm7-sketch/crypto-trading-dashboard` from GitHub in Vercel. Use the Vite preset (or configure the project root), with `npm install` as the install command, `npm run build` as the build command, and `dist` as the output directory. Add these environment variables for Production and Preview:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Use the Supabase project URL and publishable/anon key only. Never add the service-role key. Apply all SQL migrations and enable the configured Supabase Auth providers, anonymous sign-ins, and manual identity linking before testing the deployed app. `006_enable_workspace_realtime.sql` enables realtime table publication; focus, page navigation, and periodic revalidation still refresh data if publication has not yet been enabled. Browser OCR uses Tesseract.js and needs no OCR API key; first use downloads the English model and WASM core from the public CDN. `vercel.json` provides SPA route fallback.

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
