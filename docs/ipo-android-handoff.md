# IPO tracking — Android handoff

**Status: the website implements IPO tracking; the Android app does NOT yet.** The Android repo on GitHub
(`crypto-trading-android`) is a snapshot from sessions 1–6 (`com.tradingdashboard`) and does not contain the later
work (`com.example.cryptotradingdashboard`, sessions 7–28), and no Kotlin/Gradle toolchain or network was available
when this was built. No Android code was written or claimed.

## What Android already shares (no work needed)
- The same Supabase project and Auth users. Migration `012_ipo_tracking.sql` creates `ipo_trades` and `ipo_extractions`
  with row-level security (`auth.uid() = user_id`), so an authenticated Android client sees exactly the same rows.
- Realtime is published for `ipo_trades`.

## Contract to implement
- Tables/columns: see `supabase/migrations/012_ipo_tracking.sql` (all money is INR; **NULL means unknown, never 0**).
- Statuses: `APPLIED | ALLOTTED | PARTIALLY_ALLOTTED | NOT_ALLOTTED | LISTED`.
  Transitions: APPLIED → ALLOTTED / PARTIALLY_ALLOTTED / NOT_ALLOTTED; ALLOTTED / PARTIALLY_ALLOTTED → LISTED.
- Insert/update with the same field rules as `src/services/ipoRepository.ts` (`mapIpoDraftToRow`):
  trim text, upper-case application number and ticker, blank → NULL, and send price timestamp/source only with a price.
- Duplicate `(user_id, application_number)` returns Postgres error `23505` → show "already saved".

## Calculation rules (port `src/services/ipoCalculations.ts`)
Application amount ≠ allotted investment. Never assume allotment. Rules are documented at the top of that file.

**Verify your Kotlin port against `docs/ipo-calculation-vectors.json`** (12 cases, generated from the TypeScript code and
kept in sync by `src/services/ipoVectors.test.ts`). Every `expected` field, including `null`s, must match exactly
(2-decimal rounding).

## OCR
Parsing is pure text → fields (`src/services/ipoOcrParser.ts`); port it behind ML Kit text recognition and reuse the test
strings in `src/services/ipoOcrParser.test.ts`. Always preserve raw text in `ipo_extractions.raw_text`.
