# GitHub Production Configuration

Configure these controls before a protected production workflow is dispatched.
Do not place secret values in Git, workflow inputs, job summaries, issues, or
release records. Production is `ghohuwwjxgjqnbsauvzq`; the dedicated load
project is `vadyhuipwbtgbzpeisbn` and is prohibited as a production target.

## Backend dispatch and environment scope

`disposable-upgrade` and `bootstrap` are the only backend dispatch modes.
`disposable-upgrade` receives no backup or restore inputs: its protected job
requires an empty bootstrap identifier and runs the aggregate disposable-state
preflight before mutation. `bootstrap` retains its canonical authorization
identifier and strict empty-state preflight.

The `production-backend` environment is limited to `main`. Its variables must
bind `PRODUCTION_SUPABASE_PROJECT_REF` exactly to `ghohuwwjxgjqnbsauvzq`, bind
the public URL to that project, and keep `LOAD_SUPABASE_PROJECT_REF` exactly
`vadyhuipwbtgbzpeisbn`. No second human reviewer is required while the
disposable-state preflight passes; this is not a substitute evidence field and
does not waive any automated or runtime security gate.

`production-readiness` and `github-pages` remain distinct `main`-limited
environments. Pages receives no Supabase credential and publishes only the
verified immutable artifact after readiness. `load-test` receives only
load-project credentials and synthetic per-run fixtures.

## Credentials and exclusions

Keep production credentials environment-scoped. `PRODUCTION_SUPABASE_SECRET_KEY`
belongs only in `production-backend`, is server-only, and is never a repository
variable or repository secret. Keep signing and readiness secrets out of
frontend values, bundles, logs, artifacts, caches, summaries, issues, and
release records. Rotate any unintentionally disclosed credential.

GitHub stores no backup, database connection string, Storage administration key,
encryption key, plaintext export, object path, or protected manifest. Do not
add any of them to Actions inputs, variables, secrets, artifacts, caches,
summaries, issues, or release records. The disposable preflight emits only the
permitted aggregate classification and never protected rows or identifiers.

## Verification

Before release, verify exact project and URL mappings, `main` branch scope,
credential isolation, no Pages Supabase credential, no production credential in
the load environment, and the protected backend's exact SHA/ref/URL checks.
These controls remain required even when disposable state makes recovery a
forward rebuild rather than a restoration.
