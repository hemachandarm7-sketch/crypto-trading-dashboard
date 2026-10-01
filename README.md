# Crypto Trading Dashboard

**A modern workspace for crypto trade management, screenshot organization, analytics, and performance tracking.**

> V1 is a local-first UI prototype. Example journal records are illustrative, and open-position prices are sample values for the interface. No exchange data or server is connected.

## Features

- Dark-first, responsive trading-terminal layout with Dashboard, Trades, Open Positions, Upload Screenshot, Analytics, and Settings sections.
- Portfolio summary, equity curve, recent trades, active positions, and win/loss snapshot.
- Trade journal with local create, edit, delete, search, and status filtering.
- Position overview with risk levels and clearly identified sample prices.
- Screenshot drag-and-drop, preview, metadata, and session-only delete. The OCR service boundary is prepared; image analysis is not implemented.
- Analytics for realized P&L, win rate, profit factor, drawdown, direction, and coin performance.
- Local browser persistence for trades and preferences; no authentication, backend, exchange API, OCR, or AI.

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

Vite prints the local URL (typically `http://localhost:5173`). Trade data and preferences are stored in this browser's local storage. Screenshot previews are kept in memory for the current page session.

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
  data/
    mockTrades.ts         Clearly labeled illustrative seed trades
  services/
    analytics.ts          P&L and performance calculations
    screenshotAnalysis.ts Future OCR/AI integration boundary
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

The UI consumes typed trade records and calls calculation helpers in `src/services`. V1 keeps trade and preference persistence in a small browser-local storage adapter. Illustrative data lives separately in `src/data` and can be replaced by an API-backed repository later. Screenshot processing has an explicit `ScreenshotAnalysisService` interface but deliberately returns no simulated OCR results.

## Roadmap

1. Add focused component and utility tests, then refine table filtering, sorting, and trade detail views.
2. Introduce a backend and database with import/export and user authentication.
3. Add durable screenshot storage and a real OCR/AI provider behind the analysis service.
4. Add opt-in exchange integrations and verified market price feeds.
5. Expand analytics, notifications, and configurable risk management.

## License

MIT. See [LICENSE](./LICENSE).
