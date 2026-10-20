# Ledgerline

Local-first, single-user sales dashboard. Record sales, products and customers on your own machine and see revenue, trends, rankings
and insights for any date range. Everything is stored in one SQLite file; nothing leaves the machine. Built with Next.js 16 (App Router)
on SQLite.

## Prerequisites

| Tool               | Version                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js            | 24 LTS (`.nvmrc` is `24`). Another major (25, 26) loads a mismatched `better-sqlite3` binary and fails.                                                                           |
| pnpm               | 11.22.0, pinned through `packageManager`. Run `corepack enable` once.                                                                                                             |
| Native build tools | Only when no `better-sqlite3` prebuilt binary matches your platform: Xcode Command Line Tools (macOS), `build-essential` + Python 3 (Linux), Visual Studio Build Tools (Windows). |

If your default `node` is another major, put Node 24 first on `PATH` for the whole shell session (`nvm use`, or
`export PATH=/opt/homebrew/opt/node@24/bin:$PATH` with Homebrew).

## Quick start

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The first request creates `data/sales.db` and applies the migrations; the app starts empty. To explore with
sample data, open Settings → Demo data → Load demo data.

## Production

```bash
pnpm build
pnpm start            # http://localhost:3000; PORT=3001 pnpm start to change the port
```

`pnpm build` never opens the database. The app has no authentication: keep it on your machine. To bind to loopback only, start it with
`pnpm start -H 127.0.0.1`. Never expose it through a public proxy or tunnel.

## Database

| Path                                        | Content                                                        |
| ------------------------------------------- | -------------------------------------------------------------- |
| `data/sales.db`                             | The database (WAL mode; `-wal` and `-shm` files sit beside it) |
| `data/backups/sales-<stamp>.db`             | Backups                                                        |
| `data/backups/pre-restore/sales-<stamp>.db` | Safety copy taken before every restore                         |

All variables are optional:

| Variable               | Default                                | Meaning                                                                                   |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `SALES_DB_PATH`        | `data/sales.db` under the project root | Database file; absolute, or relative to the project root (never to the shell's directory) |
| `SALES_DASHBOARD_ROOT` | auto-detected                          | Forces the project root                                                                   |
| `PORT`                 | `3000`                                 | Port for `pnpm start`                                                                     |

The project root is the nearest parent directory whose `package.json` has `"name": "sales-dashboard"`, so the app, the CLIs and
`pnpm start` from any sub-directory all use the same file. Keep the package name, or set `SALES_DASHBOARD_ROOT`. Settings → Data &
storage shows the resolved database path.

Migrations apply automatically on the first open. After editing `src/db/schema.ts`, run `pnpm db:generate --name <name>` and commit
the new files in `drizzle/`. Migrations are forward-only; recover from a bad one by restoring a backup.

## Demo data

| Action | UI                                      | CLI                                                                               |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------- |
| Load   | Settings → Demo data → Load demo data   | `pnpm db:seed` (refuses on a database with data; `--force` adds demo rows anyway) |
| Remove | Settings → Demo data → Remove demo data | `pnpm db:demo:remove`                                                             |

Demo rows are tagged "Demo" and use `DEMO-00001`-style order references. Removing them never touches your own records.

## Backup and restore

Backups use SQLite's online backup API, so they are consistent while the app is running. Never copy `data/sales.db` with the file
system while the app runs; the copy can miss data still in the `-wal` file.

- Back up: Settings → Back up now, or `pnpm db:backup [target-dir]`.
- Restore (order matters):
  1. Stop every running `pnpm dev` / `pnpm start`.
  2. Run `pnpm db:restore <backup-file>`. The backup is verified first, and the current database is saved to `backups/pre-restore`.
  3. Start the app again.

To undo a restore, restore the safety copy from `data/backups/pre-restore/` the same way.

## Resetting data

| Goal                                 | How                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Remove sample data only              | Settings → Demo data → Remove, or `pnpm db:demo:remove`                                                   |
| Delete all records, keep preferences | Settings → Erase all data, typing `DELETE ALL DATA`                                                       |
| Start from an empty file             | Stop the app, back up, delete `data/sales.db`, `data/sales.db-wal` and `data/sales.db-shm`, start the app |

Erasing data and deleting database files cannot be undone. Take a backup first.

## How the numbers work

- Revenue is the sum of completed sales, net of discounts, excluding tax.
- Sales, average order value and units sold count completed sales only.
- Net profit is revenue minus product cost, shown only when every completed sale in the period has cost data.
- Pending sales are not counted yet; refunded sales are full refunds and leave revenue; cancelled sales never count. Pending and
  refunded totals are shown in a note under the key metrics.
- Changes compare with the previous period of equal length. Days, weeks (Monday start) and months use your machine's local time.
- Currency is a display setting only: changing it never converts stored amounts.

## Tests

| Command                 | What it runs                                                                      |
| ----------------------- | --------------------------------------------------------------------------------- |
| `pnpm test`             | Vitest unit and integration tests (61) on temporary databases                     |
| `pnpm test:e2e:install` | Downloads Playwright Chromium (once per machine)                                  |
| `pnpm test:e2e`         | Playwright (5 cases) on its own dev server at port 3200 with a throwaway database |
| `pnpm check`            | Typecheck, lint, format check and Vitest                                          |

Tests never touch `data/`.

## Troubleshooting

| Symptom                                                                             | Fix                                                                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Could not locate the bindings file`                                                | Check `allowBuilds.better-sqlite3: true` in `pnpm-workspace.yaml`, then `pnpm rebuild better-sqlite3` |
| `NODE_MODULE_VERSION` mismatch                                                      | Switch to Node 24, then `pnpm rebuild better-sqlite3` (or delete `node_modules` and reinstall)        |
| `gyp` or compiler errors during install                                             | Install the native build tools listed above and reinstall                                             |
| 503 with "Cannot open SQLite database at …" or "Cannot create the data directory …" | Fix folder permissions or point `SALES_DB_PATH` to a writable file                                    |
| 503 with "Database migration failed for …"                                          | Restore a known-good backup                                                                           |
| "database is locked"                                                                | Stop the other process; never run `pnpm db:restore` while the app runs                                |
| App and CLI show different data                                                     | Compare the path in Settings → Data & storage with the CLI output                                     |
| Port already in use                                                                 | `pnpm dev -p 3001` or `PORT=3001 pnpm start`; for e2e, free port 3200                                 |
| Playwright: `Executable doesn't exist`                                              | `pnpm test:e2e:install`                                                                               |
| `next dev` modifies `AGENTS.md`                                                     | Expected; commit the file                                                                             |

## Limitations

One user and one app server per database file, no authentication, one reporting currency at a time (two-decimal currencies only, no
conversion), full refunds only, no inventory tracking.
