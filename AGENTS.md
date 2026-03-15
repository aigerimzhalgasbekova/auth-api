Auth API is an AWS Lambda-based authentication service (JWT issuing and verification via KMS) with infrastructure managed by AWS CDK. TypeScript throughout.

## Packages

This repo contains independent npm packages — each has its own `package.json`, lockfile, and config. Install dependencies and run commands from within each package directory.

- `cdk/` — AWS CDK infrastructure stacks and tests
- `src/auth-token-issuer/` — Lambda that issues JWT tokens from Basic Auth credentials
- `src/authorizer/` — API Gateway custom authoriser that verifies JWTs via KMS
- `src/authorization-code-flow-with-pkce/` — Lambda that implements OAuth 2.0 authorization code flow with PKCE
- `src/echo/` — protected echo endpoint

## Working with this repo

Use `npm install` for local development, `npm ci` in CI. Each package supports `npm run lint`, `npm test`, and `npm run build`.

Run lint and tests in affected packages before committing. New changes should be covered by unit tests when possible. Substantial changes and new features should be documented.

## Commits and branching

Do not commit directly to `master` — always create a feature branch (e.g. `fix/...`, `feat/...`, `chore/...`).

Commit messages follow the Angular conventional commit format, consumed by `semantic-release` (see `.releaserc.yaml` for release rules):

- `feat: ...` — new feature (minor release)
- `fix: ...` — bug fix (patch release)
- `chore: ...` — maintenance (patch release)
- `refactor: ...` — refactoring (patch release)
- `docs(README): ...` — documentation (minor release)
- `style: ...` / `test: ...` / `cicd: ...` — no release

Scopes are optional: `fix(authorizer): ...`, `chore(deps): ...`

## Code style

TypeScript with ESLint and Prettier. Use `npm run lint:fix` and `npm run format` within a package to auto-fix.

## CI/CD

GitHub Actions workflow in `.github/workflows/workflow.yaml`. Runs CDK tests, creates versions via semantic-release, builds Lambda packages, and deploys CDK stacks on `master`. Node.js 22.
