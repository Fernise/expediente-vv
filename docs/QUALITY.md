# Quality scope and known limitations

The repository runs TypeScript, ESLint, builds, offline regressions and source/secret checks. React Compiler is not enabled in this Vinext application.

The upgraded React lint analyzer reports existing DOM/portal ref forwarding, external-state hydration and effect-driven reset patterns. Those diagnostics are retained as warnings in explicitly listed components. Other lint rules keep their configured severity. Refactoring these UI patterns should be a separate, interaction-tested change rather than altering their behavior during source publication.

The dependency audit was brought to zero high/critical npm findings at preparation time. Moderate findings remain in portions of the Vinext/OG or migration tooling dependency tree. Their upstream remediation requires a separately tested tooling migration; the project does not claim a clean audit at every severity or that its development server is suitable for untrusted public access.

Run development servers on loopback. Build/source checks and fictional fixtures do not verify production configuration, third-party authorization, real data or physical-device workflows.
