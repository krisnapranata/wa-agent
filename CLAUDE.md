# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

WhatsApp bot for hospital inpatient follow-up ("WA Bot Rawat Inap"). It reads a hospital SIMRS MySQL database, broadcasts alerts to staff about discharged patients who are missing a **Resume Medis** or a **Surat Kontrol**, and answers patient-lookup commands sent over WhatsApp. User-facing strings, log messages, comments, and DB column names are in Indonesian. Keep them that way.

All code lives in `nodejs_space/` (NestJS 11, TypeScript compiled to CommonJS, Yarn 4). The repo root only has the README, `.gitignore`, and this file.

## Commands

Run these from `nodejs_space/`:

Yarn is not installed globally. Run it through corepack. Also, `.yarnrc.yml` points `globalFolder` at `/opt/hostedapp` (an old host), so override that folder for every yarn call:

```bash
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 YARN_GLOBAL_FOLDER=$HOME/.yarn/berry
corepack yarn install
corepack yarn build            # nest build -> dist/ (also copies dashboard.html, see nest-cli.json "assets")
corepack yarn start:dev        # watch mode
node dist/main.js              # API + dashboard (PORT, default 3000; 3000 is already taken on this host)
node dist/scheduler.js         # broadcast scheduler, calls the web process over HTTP
corepack yarn test             # jest, *.spec.ts under src/ (none exist yet)
corepack yarn test -- path/to/file.spec.ts
npx --no-install eslint <files>     # lint only the files you touched (see below)
docker compose up -d --build        # production stack (needs .env.production from deploy/env.production.contoh)
```

Do not run `yarn lint` / `yarn format` across the repo. Much of the existing code does not follow prettier, and both scripts rewrite files in place (`--fix` / `--write`). Lint or format only the files you changed.

Configuration comes from `nodejs_space/.env` (see `.env.example`). Set `WA_ENABLED=false` to run the HTTP API without opening a WhatsApp connection. The admin dashboard is at `/dashboard`, and Swagger is served at `/api-docs`. To exercise the bot without WhatsApp, use `POST /bot/test`, which needs an API key.

`nodejs_space/.env` holds **real production SIMRS credentials** (patient data). Never overwrite it, and don't point manual tests at it. For end-to-end checks, start a throwaway `mysql:8.0` container seeded with fake `pasien` / `resume_medis` / `surat_kontrol` / `diagnosa_pasien` rows (columns are in the README's "Asumsi Skema"), and pass its connection info as env vars. `docker compose` also reads `nodejs_space/.env` for `${…}` interpolation (`NPM_NETWORK`, `APP_PORT`). Add keys to that file; never replace it.

## Architecture

**Module wiring** (`app.module.ts`): `DatabaseModule` → `HospitalModule` (SIMRS queries + `MessageFormatter`) → `BotModule` (command router) → `WhatsappModule` (Baileys socket, which calls `BotService` for incoming messages) → `BroadcastModule` (alert fan-out through `WhatsappService`). `NumbersModule` manages the `broadcast_numbers` allowlist. `AuthModule` provides `ApiKeyGuard`.

**Database access**: there is no ORM in use. Prisma appears in `package.json`, but no schema exists. All SQL is raw `mysql2` through `DatabaseService.query()` / `execute()`, and the pool is created lazily. There are two groups of tables:
- **SIMRS tables** are owned by the hospital system and are read-only for the bot. Their names are configurable through `TBL_PASIEN`, `TBL_RESUME`, `TBL_KONTROL`, and `TBL_DIAGNOSA`, so always go through `HospitalService.tbl()` / `this.T`, which validates and backtick-quotes the name. Never hardcode these table names. The README section "Asumsi Skema" lists the assumed columns.
- **Bot tables** (`broadcast_numbers`, `wa_auth_state`, `api_keys`, `broadcast_log`) are created by `DatabaseService.ensureSchema()` from `database/schema.ts`. Call `ensureSchema()` before touching these tables. If you change `schema.ts`, keep `sql/001_bot_tables.sql` in sync by hand.

**WhatsApp (Baileys v7)**: `@whiskeysockets/baileys` is ESM-only, so it must be loaded through `whatsapp/baileys-loader.ts` (`loadBaileys()`, which uses a `new Function` dynamic import). Do not add a static `import` from baileys. `WhatsappService` starts connecting in a non-blocking way on bootstrap, reconnects with exponential backoff, and clears the session on `loggedOut`. Auth state lives in MySQL (`wa_auth_state`, via `mysql-auth-state.ts`) when `AUTH_STORE=mysql`, or in files under `SESSION_DIR` when it is `file`. Sender phone numbers can arrive as LIDs, so `extractPhone` also checks the `*Alt` JID fields.

**Security model**:
- Admin endpoints use `ApiKeyGuard`. The key comes from the `x-api-key` header or the `?key=` query parameter.
  - The env `ADMIN_API_KEY` is always accepted, using a timing-safe compare.
  - Any other key is checked against SHA-256 hashes in `api_keys`.
  - The admin key is seeded into `api_keys` lazily and retried on later requests, because the DB may be unreachable when a container starts.
- `GET /status`, `GET /healthz`, and the `/dashboard` HTML shell are public.
- When `BOT_ONLY_REGISTERED=true` (the default), the bot replies only to numbers that are active in `broadcast_numbers`, because it serves patient data. Phone numbers are normalized to the `628…` form by `normalizePhone` in `common/format.ts`.

**Dashboard** (`src/dashboard/`): `GET /dashboard` serves a single self-contained `dashboard.html` (vanilla JS, no CDN, because hospital LANs may be offline). The page itself is public; all data comes from API-key-guarded endpoints (existing ones plus `/dashboard/api/*`), and the key is sent as an `x-api-key` header from session/local storage. `dashboard.html` is copied to `dist/` through the `assets` entry in `nest-cli.json` and read via `__dirname`, so a new non-TS asset needs a matching `assets` glob. Escape every DB value with `esc()` before inserting it into HTML.

**Docker** (`nodejs_space/Dockerfile`, `docker-compose.yml`, `docker/entrypoint.sh`, `deploy/`): one image, roles `web` (`dist/main.js`) and `scheduler` (`dist/scheduler.js`, a standalone non-Nest script that calls `/broadcast/check-*` and `/whatsapp/keepalive` on the web container over HTTP, so only one process ever owns the WhatsApp socket). Only `wabot_nginx` publishes a host port, and it joins the external Nginx Proxy Manager network. There is no DB container because SIMRS MySQL is external. The Dockerfile overrides `.yarnrc.yml`'s host-specific `globalFolder` and hardlink mode through `YARN_*` env vars. `/healthz` must stay DB-free.

**Bot commands**: regex routing happens in `BotService.route()`, and reply text is built in `hospital/message-formatter.ts`.

**Broadcasts**: `BroadcastService.run(tipe, dryRun)` is skipped when no patient needs an alert. It sends to every active number with `BROADCAST_DELAY_MS` between sends and writes a row to `broadcast_log`. The Nest app itself has no timer. Scheduled runs come from `src/scheduler.ts`, a separate process. It hits `POST /broadcast/check-resume` and `/broadcast/check-kontrol` at each `BROADCAST_TIMES` entry (HH:MM in `APP_TIMEZONE`; empty disables it), and it calls `/whatsapp/keepalive` every `KEEPALIVE_MINUTES`. Because it is not part of the Nest module graph, don't import Nest services into it; extend it over HTTP.

**Alert rules** (`HospitalService`): the rules are controlled by these env vars:
- `ALERT_LOOKBACK_DAYS`
- `KONTROL_DEADLINE_HOURS`
- `RESUME_DONE_STATUS`
- `MATCH_CURRENT_VISIT`, which counts a resume/kontrol only if it was created on or after `tgl_masuk`

Dates are formatted in `APP_TIMEZONE`, which defaults to `Asia/Makassar`.
