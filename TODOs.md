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
- ~~Fail-open `iss` validation~~ — authorizer now rejects all tokens when `TOKEN_ISSUER` is unset
- ~~Fail-open `redirect_uri` allowlist~~ — PKCE endpoint now rejects all URIs when the allowlist is empty
- ~~Unvalidated JWT `alg` header~~ — pinned to `PS256`, malformed tokens rejected before decoding
- ~~Echo Lambda reflected and logged the caller's `Authorization` header~~ — headers stripped
- ~~Username enumeration via response timing~~ — password verified against a dummy hash when the user is absent
- ~~Unbounded credentials in the `Authorization` header~~ — capped at 512 base64 characters
- ~~Authorizer and PKCE Lambdas logged full token claims / request events~~ — reduced to non-sensitive fields
- ~~Stale `dynamodb:Query` IAM permission~~ — removed from the auth-token-issuer role

---

## P1 — High Priority

### Wire `REDIRECT_URI_ALLOWLIST` env var in deployment
The redirect URI allowlist is now enforced fail-closed: with `REDIRECT_URI_ALLOWLIST` unset or empty, every authorization request is rejected with `400`. The PKCE Lambda is not deployed via CDK, so this env var must be set through whatever deployment mechanism is used, otherwise the endpoint issues no codes at all.

### Implement single-use authorization code enforcement at `/token` endpoint
The `used-authorization-codes` DynamoDB table exists with `jti` partition key and TTL, but no `/token` endpoint exists yet to consume authorization codes. When implemented, the endpoint must:
1. Check `jti` against the table before accepting a code
2. Write the `jti` to the table with a `ttl` matching the code's expiry
3. Reject codes that have already been used

**Table**: `used-authorization-codes` (already provisioned)

---

## P2 — Medium Priority

### Move `@aws-sdk/client-kms` to devDependencies in PKCE package
`@aws-sdk/client-kms` is listed as a production dependency in `src/authorization-code-flow-with-pkce/package.json` but is provided by the Lambda runtime. Moving it to `devDependencies` (consistent with auth-token-issuer) would reduce bundle size.

**File**: `src/authorization-code-flow-with-pkce/package.json`

### Hoist KMSClient to module scope in PKCE handler
The PKCE handler creates `new KMSClient({})` inside `generateAuthorizationCode` on every invocation. Moving it to module scope (like auth-token-issuer) enables connection reuse across Lambda invocations and improves cold-start performance.

**File**: `src/authorization-code-flow-with-pkce/index.ts`
