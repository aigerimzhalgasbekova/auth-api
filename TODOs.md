# Security & Quality TODOs

Unaddressed recommendations from the codebase security and architecture analysis.

## Resolved

The following items have been addressed on the `fix/security-and-quality-improvements` branch:

- ~~Plaintext password storage in DynamoDB~~ — replaced with bcrypt hashing
- ~~Replace `base64url` npm package~~ — replaced with native `Buffer.toString('base64url')`
- ~~Enable `noImplicitAny` in tsconfig~~ — enabled, all type errors fixed
- ~~Validate `redirect_uri` against an allowlist~~ — added via `REDIRECT_URI_ALLOWLIST` env var
- ~~Enforce single-use authorization codes~~ — DynamoDB table created (enforcement at `/token` endpoint pending)
- ~~Extract shared ESLint/Prettier/Jest configurations~~ — extracted to root-level shared configs
- ~~Add request rate limiting~~ — API Gateway throttling added (10 req/s, 20 burst)
- ~~Add input validation for JWT claims~~ — type checks added for all claims
- ~~Validate `iss` claim in authorizer~~ — validated against `TOKEN_ISSUER` env var

---

## P1 — High Priority

### Wire `REDIRECT_URI_ALLOWLIST` env var in deployment
The redirect URI allowlist validation code is in place (`src/authorization-code-flow-with-pkce/config.ts`), but the `REDIRECT_URI_ALLOWLIST` environment variable is not configured in any CDK stack. The PKCE Lambda is not currently deployed via CDK, so this env var must be set through whatever deployment mechanism is used.

Without it, the allowlist defaults to empty and all valid URIs are accepted (backward-compatible but not secure-by-default).

### Implement single-use authorization code enforcement at `/token` endpoint
The `used-authorization-codes` DynamoDB table exists with `jti` partition key and TTL, but no `/token` endpoint exists yet to consume authorization codes. When implemented, the endpoint must:
1. Check `jti` against the table before accepting a code
2. Write the `jti` to the table with a `ttl` matching the code's expiry
3. Reject codes that have already been used

**Table**: `used-authorization-codes` (already provisioned)

### Remove stale `dynamodb:Query` IAM permission
After switching from `QueryCommand` to `GetCommand` for user lookups, the `dynamodb:Query` permission on the auth-token-issuer Lambda role is no longer needed. Remove it to follow the principle of least privilege.

**File**: `cdk/lib/token-issuer-stack.ts`

---

## P2 — Medium Priority

### Make `iss` validation mandatory (fail-closed)
The authorizer's `iss` validation is currently opt-in: if `TOKEN_ISSUER` env var is unset, the check is skipped entirely. While CDK provides a fallback value, a misconfigured deployment would silently accept tokens from any issuer. Consider making the check mandatory (throw if `TOKEN_ISSUER` is missing) or at minimum logging a warning.

**File**: `src/authorizer/index.ts`

### Move `@aws-sdk/client-kms` to devDependencies in PKCE package
`@aws-sdk/client-kms` is listed as a production dependency in `src/authorization-code-flow-with-pkce/package.json` but is provided by the Lambda runtime. Moving it to `devDependencies` (consistent with auth-token-issuer) would reduce bundle size.

**File**: `src/authorization-code-flow-with-pkce/package.json`

### Hoist KMSClient to module scope in PKCE handler
The PKCE handler creates `new KMSClient({})` inside `generateAuthorizationCode` on every invocation. Moving it to module scope (like auth-token-issuer) enables connection reuse across Lambda invocations and improves cold-start performance.

**File**: `src/authorization-code-flow-with-pkce/index.ts`
