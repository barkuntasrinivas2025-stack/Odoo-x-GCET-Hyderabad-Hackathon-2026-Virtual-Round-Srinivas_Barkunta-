# Wiring this into your repo (Git Bash)

Assuming you're inside your cloned repo already:

```bash
# copy these files in (adjust source path to wherever you extracted this)
cp -r path/to/stocksense/* .

npm install

cp .env.example .env
# edit .env with your real Postgres connection string

# needs a running Postgres — easiest local option if you don't have one:
# docker run --name stocksense-pg -e POSTGRES_PASSWORD=password -e POSTGRES_DB=stocksense -p 5432:5432 -d postgres:16

npm run db:push      # creates tables from schema.ts, no migration files needed for a hackathon
npm run dev          # starts on :4000, auto-restarts on save
```

Sanity check once it's running:

```bash
curl http://localhost:4000/api/dashboard/risk
curl http://localhost:4000/api/ledger/verify
```

## What still needs building (do these in order)

1. **Seed script** — insert a warehouse, a category, and 5-10 products so the risk endpoint has data to chew on.
2. **Auth routes** — signup/login/OTP reset per the spec. Use `bcryptjs` + `jsonwebtoken`, both already in package.json.
3. **CRUD routes for documents** — create receipt/delivery/transfer/adjustment + lines. The `validate` route already exists and does the hard part (ledger + broadcast).
4. **React dashboard** — connect via `socket.io-client`, `socket.emit('join_warehouse', id)`, listen for `stock_delta` and patch state directly instead of refetching. Render the risk list from `/api/dashboard/risk` sorted by `daysOfCover` with color-coded rows (critical/warning/ok).
5. **"Verify Ledger Integrity" button** — hits `/api/ledger/verify`, shows a green check or the exact row where it broke. This is your demo closer — deliberately edit a row in psql mid-demo and show it catch it.

Don't build a UI for every CRUD screen in the spec before the differentiators work end-to-end. Get one receipt flowing through validate → ledger → live dashboard update → risk list, demo that path first, then backfill the rest of the CRUD screens — they're mechanical once this works.
