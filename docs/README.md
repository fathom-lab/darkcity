# DarkCity · Docs

Operational runbooks, deploy checklists, and historical scope documents. If you're looking for *what the project is*, start with the [root README](../README.md).

## Index

### Deployment
- [**DEPLOY-NOW.md**](./DEPLOY-NOW.md) — the quickest path from clone → live
- [**DEPLOYMENT-CHECKLIST.md**](./DEPLOYMENT-CHECKLIST.md) — pre-flight checks before deploying to prod
- [**STYXX_DEPLOY.md**](./STYXX_DEPLOY.md) — Solana + Token-2022 deploy specifics
- [**SETUP-GUIDE.md**](./SETUP-GUIDE.md) — fuller setup notes (historical)

### Operations
- [**STYXX_ECONOMY_V1_RUNBOOK.md**](./STYXX_ECONOMY_V1_RUNBOOK.md) — live economy operational runbook
- [**QUICK-REFERENCE.md**](./QUICK-REFERENCE.md) — quick-glance commands + endpoints
- [**FLOBI-READ-ME-FIRST.md**](./FLOBI-READ-ME-FIRST.md) — ops notes specific to operator

### Audits + scope
- [**AUDIT-REPORT.md**](./AUDIT-REPORT.md) — earlier code audit
- [**SITE_AUDIT_2026-04-19.md**](./SITE_AUDIT_2026-04-19.md) — site audit snapshot
- [**STYXX_ECONOMY_V1_1_SCOPE.md**](./STYXX_ECONOMY_V1_1_SCOPE.md) — V1.1 planning doc

## Document lifecycle

These are **archival** — they represent the state at the moment of writing, not necessarily how the system runs today. The authoritative source is always:

1. The running code in `hooks/`, `lib/`, `scripts/`, `server.js`
2. The [root README](../README.md) (kept current)
3. `/api/health` on the live deployment (for current operational state)

If a doc contradicts the code, the code is right.

## Adding a doc

New operational docs go here. Please:
- Date the doc in the filename or a front-matter line
- Link it from this index
- Keep them focused — one concern per doc, not kitchen-sinks
