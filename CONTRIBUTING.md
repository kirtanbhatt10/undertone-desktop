# Contributing to Undertone

Thanks for helping. A few things keep changes easy to review.

## Getting started

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup, scripts and testing, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit.

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run test:e2e      # xvfb-run -a … on headless Linux
npm run scan:secrets
```

- Keep pull requests focused; one change per PR.
- Add or update tests for behaviour you change. UI features need an e2e assertion.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).
- Never commit `.env`, keys, or anything from your data folder.

## Security-sensitive areas

Changes to `src/preload`, `src/main/index.ts` (IPC, hardening), `src/main/schemas.ts`,
`src/renderer/src/lib/markdown.ts` or either CSP get extra scrutiny. Explain the reasoning in the PR.

## Scope

Undertone uses only documented OS capture-exclusion APIs. Contributions that hide the process,
evade security, monitoring or proctoring software, capture the screen or audio without an explicit
user action, or weaken the consent prompt for recording will not be accepted.

## Reporting bugs

Use the issue templates. For Privacy Mode reports include your OS build, the self-test result, and
the capture tool involved. For vulnerabilities see [SECURITY.md](SECURITY.md).
