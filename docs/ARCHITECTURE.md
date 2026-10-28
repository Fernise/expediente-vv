# Expediente VV — architecture

A multi-tenant B2B workspace for Canary Islands holiday-rental dossiers, private documents, review checklists and traceable rule workflows.

## Code boundaries

- **app/:** Public pages, authenticated workspace and API routes.
- **lib/ and db/:** Domain rules, data access and security boundaries.
- **drizzle/:** Versioned database migrations.
- **worker/ and build/:** Scheduled worker and build-time hosting adapter source.
- **types/:** Cloudflare logical binding declarations.
- **tests/:** Permissions, tenancy, document, rule and recovery tests.

## Data boundary

This public repository contains application source and fictional test inputs. Personal/operational state belongs in ignored local storage or separately configured services. Test results establish the behavior exercised by the suite; they do not certify live integrations, product efficacy or deployment readiness.

See the README for implementation status and `CONFIGURATION.md` for provider-specific requirements.
