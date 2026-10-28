# Configuration

## Isolated Cloudflare development

The Vite integration uses logical `DB` and `DOCUMENTS` bindings from `.openai/hosting.json`; no hosting account identifier is bundled.

```sh
npm ci
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
npm run dev
```

The local config and Vite plugin use the same placeholder D1 identity. `DB` is D1; `DOCUMENTS` is private R2 storage. The `build/` directory contains required source for the hosting packaging plugin and is intentionally versioned. Generated bundles live in ignored `dist/`.

Schema source is `db/schema.ts`; migration SQL lives in `drizzle/`. Run `npm run db:generate` only after deliberately changing the schema. `wrangler.types.jsonc` is for runtime type generation, not a production deployment definition.

## Optional mail and identity integration

Email remains unconfigured by default. The blank `.env.example` documents `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET` and `GMAIL_OAUTH_REFRESH_TOKEN`. Supply these through private runtime configuration only. Never commit populated OAuth values or attach real documents to a test.

Private access depends on the hosting identity adapter. Real dossiers stay blocked until the required identity/MFA, document scanning and operational prerequisites are completed. Included rules are explicitly unvalidated drafts; a dossier state is not a legal determination.

## Backup tools

Use fictional records with the cryptographic backup/recovery tests. `EXPEDIENTE_BACKUP_KEY_BASE64` is a private operator secret, never a repository value. Do not commit exports, R2 objects, local `.wrangler` state, owner information or real property documents.
