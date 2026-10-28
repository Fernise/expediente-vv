# Public source verification

Prepared on 28 October 2026 from the reviewed publication snapshot.

Build, strict type checking, offline regression suite, lint and local D1 migrations.

Automated test cases passed in local verification: **148**.

Verification used fictional fixtures, temporary databases and mocked providers. It does not establish real-service access, deployed readiness, legal compliance or measured product efficacy. No production deployment or real messaging was performed.

GitHub Actions reruns the documented verification on Ubuntu, Node.js 22 and/or Python 3.11. Use the CI badge for the current remote result.

Known lint/tooling advisories are documented in [QUALITY.md](QUALITY.md); high/critical npm audit findings were resolved without asserting zero findings at every severity.
