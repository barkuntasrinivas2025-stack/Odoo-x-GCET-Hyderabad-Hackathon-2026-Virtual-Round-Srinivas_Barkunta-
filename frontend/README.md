# StockSense

Inventory intelligence platform that answers two questions traditional inventory systems don't:

1. **Which products are actually at risk of running out** — based on real consumption velocity, not a static reorder-point flag.
2. **Can you trust your inventory history** — every stock-affecting event is recorded in a SHA-256 hash-chained ledger, so tampering after the fact is mathematically detectable.

## Why this exists

A product can show healthy stock today and still be days from a stockout if it's moving fast. Static reorder points don't capture that. Separately, most inventory systems have no way to prove their historical records haven't been edited after the fact — "trust the database" isn't an answer for an audit.

StockSense addresses both in one system: a forecasting engine built on trailing consumption data, and a cryptographically verifiable audit ledger underneath every stock movement.

## Core features

- **Receipts, deliveries, transfers, adjustments** — the standard inventory document types, each generating ledger entries on validation.
- **Days-of-cover forecasting** — average daily consumption over a 14-day trailing window, converted into an estimated stockout date and a risk tier (`critical` / `warning` / `ok`).
- **Hash-chained ledger** — every ledger row commits to `SHA256(prevHash + canonical event data)`. Editing any historical row breaks the chain from that point forward, and `/api/ledger/verify` proves it.
- **Live dashboard updates** — Socket.IO pushes stock deltas to connected clients the instant a document is validated. No polling, no manual refresh.

## Architecture

```
React + TypeScript Dashboard
        │ REST / Socket.IO
        ▼
   Express API ──┬── Inventory / Document APIs
                 ├── Forecast Engine (consumption → days-of-cover → risk)
                 └── Ledger Engine (SHA-256 hash chain + verification)
                 │
                 ▼
            Drizzle ORM
                 │
                 ▼
            PostgreSQL
   (products, warehouses, stock_levels,
    documents, document_lines, ledger_entries, users)
```

`stock_levels` is a cached current-state table. The `ledger_entries` chain is the source of historical truth — stock levels are derived from it, not the other way around.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Socket.IO Client |
| Backend | Node.js, Express, TypeScript, Socket.IO |
| Database | PostgreSQL |
| ORM | Drizzle ORM, Drizzle Kit |
| Integrity / Auth | SHA-256, bcryptjs, JWT |

## How forecasting works

```
Total consumption (trailing 14 days) ÷ 14 = Average daily consumption
Current stock ÷ Average daily consumption = Days of Cover

Days of Cover ≤ 3   → CRITICAL
Days of Cover ≤ 7   → WARNING
Days of Cover > 7   → OK
No recent consumption → daysOfCover: null (the system never invents a rate)
```

Example from testing: USB-C Cable at 8 units with 4.14/day consumption forecasted 1.9 days of cover (CRITICAL). After a 20-unit receipt, stock rose to 28 and cover rose to 6.8 days (WARNING). A second receipt brought it to 49 units and 11.8 days (OK) — the dashboard reflects real operational state, not a static threshold.

## How the ledger works

Every stock-affecting event writes one row containing `documentId`, `productId`, `warehouseId`, `deltaQuantity`, `reason`, `prevHash`, `hash`, and `createdAt`. The hash is `SHA256(documentId|productId|warehouseId|deltaQuantity|reason|prevHash|createdAt)`, and it becomes the `prevHash` of the next entry.

`GET /api/ledger/verify` walks every row, recomputes each hash from its stored payload, and checks it against both the stored hash and the next row's `prevHash`. If any row was edited directly in the database after the fact, verification fails at that exact row and reports which one.

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/documents` | POST | Create a receipt/delivery/transfer/adjustment |
| `/api/documents/:id/validate` | POST | Commit the document — writes ledger entries, updates stock, broadcasts live delta |
| `/api/dashboard/risk` | GET | Ranked stockout risk per product |
| `/api/ledger/verify` | GET | Recomputes and verifies the entire hash chain |

## Setup

\`\`\`bash
npm install
cp .env.example .env      # set DATABASE_URL
npm run db:push           # creates tables from schema.ts
npm run dev                # backend on :4000
\`\`\`

See \`SETUP.md\` for the full local setup walkthrough including seeding sample data.

## Test results

All 15 functional test cases passed end-to-end, covering database connectivity, schema migration, seeding, backend/frontend builds, document creation and validation, stock updates, forecast recalculation, and ledger verification across 66 recorded ledger entries with a fully valid hash chain.

## Status

Core backend (schema, ledger, forecast engine, document validation, live updates) is implemented and tested. Frontend dashboard, auth routes, and remaining CRUD screens are in progress.
