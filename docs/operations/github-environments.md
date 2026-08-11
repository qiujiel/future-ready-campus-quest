# GitHub Production Configuration

Configure these controls before a protected production workflow is dispatched.
Do not place secret values in Git, workflow inputs, job summaries, issues, or
release records. Production is `ghohuwwjxgjqnbsauvzq`; the dedicated load
project is `vadyhuipwbtgbzpeisbn` and is prohibited as a production target.

## Backend dispatch

`disposable-upgrade`, `in-place-upgrade`, and `bootstrap` are the only backend
dispatch modes.
`disposable-upgrade` has an empty bootstrap identifier and runs the aggregate
disposable-state preflight before mutation. `bootstrap` retains its canonical
authorization identifier and strict empty-state preflight. Neither path has
backup or restore inputs.
`in-place-upgrade` keeps the bootstrap identifier empty, preserves existing
classroom data, and retains all common exact-SHA/project, automated test,
migration dry-run/order, protected credential, Function, and readiness gates.

The `production-backend` environment is limited to `main`. No second human
reviewer is required while the disposable-state preflight passes; this is not a
substitute evidence field and does not waive automated or runtime security
gates.

## Repository variables

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Public production API URL; must identify `ghohuwwjxgjqnbsauvzq`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser key for build and preflight. |
| `VITE_BASE_PATH` | Pages base path, including leading and trailing `/`. |
| `LOAD_SUPABASE_PROJECT_REF` | Must equal `vadyhuipwbtgbzpeisbn`. |

No dedicated load-test or production credential belongs at repository scope.

## `load-test` environment

This `main`-limited environment is used only by the release load gate. Its
synthetic teacher, cohort, group codes, and student sessions are created for
one run and removed before exit.

### Variables

| Variable | Purpose / validation |
| --- | --- |
| `LOAD_SUPABASE_PROJECT_REF` | Exactly `vadyhuipwbtgbzpeisbn`. |

### Secrets

| Secret | Purpose / validation |
| --- | --- |
| `LOAD_SUPABASE_URL` | Dedicated load API URL only. |
| `LOAD_SUPABASE_PUBLISHABLE_KEY` | Dedicated load browser key only. |
| `LOAD_SUPABASE_SECRET_KEY` | Modern dedicated load setup/cleanup key only. |

Never store a production credential, legacy service-role key, teacher access
token, join token, cohort ID, or content-version ID in this environment.

## `production-backend` environment

This `main`-limited environment has the following exact inventory. The public
repository variables are listed here because the protected workflow consumes
them in this environment; they remain repository variables, not environment
secrets.

### Variables

| Variable | Purpose / validation |
| --- | --- |
| `PRODUCTION_SUPABASE_PROJECT_REF` | Exactly `ghohuwwjxgjqnbsauvzq`. |
| `PRODUCTION_FRONTEND_ORIGIN` | Deployed HTTPS browser origin, with no path. |
| `VITE_SUPABASE_URL` | Consumed repository variable for the exact production API URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Consumed repository variable for the public browser key. |
| `VITE_BASE_PATH` | Consumed repository variable for the Pages base path. |
| `LOAD_SUPABASE_PROJECT_REF` | Consumed repository variable; exactly `vadyhuipwbtgbzpeisbn`. |

### Secrets

| Secret | Purpose / validation |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | CLI authorization for the production organization. |
| `PRODUCTION_SUPABASE_DB_PASSWORD` | Linked migration access. |
| `PRODUCTION_SUPABASE_SECRET_KEY` | Modern `sb_secret_` server-only key for preflight and Function administration. |
| `PRODUCTION_READINESS_SECRET` | Authorization for the least-privilege readiness endpoint. |
| `ALLOWED_FRONTEND_ORIGINS` | Exact browser origin only, with no path or trailing slash. |
| `FRONTEND_APP_URL` | Full hosted application base URL, including the Pages base path. |
| `JOIN_TOKEN_SIGNING_SECRET` | Join-token signing secret. |
| `RECOVERY_TOKEN_SIGNING_SECRET` | Recovery-token signing secret. |
| `STUDENT_LOGIN_SIGNING_SECRET` | Private student-name lookup and returning-login rate-key signer. |
| `PROTECTED_CONTENT_BANK_JSON` | Encrypted protected-content source for the separate importer only. |
| `PRODUCTION_TEACHER_EMAIL` | One-time classroom-bootstrap teacher credential. |
| `PRODUCTION_TEACHER_PASSWORD` | One-time classroom-bootstrap teacher credential. |

`ALLOWED_FRONTEND_ORIGINS` must exactly equal
`PRODUCTION_FRONTEND_ORIGIN`. `FRONTEND_APP_URL` must combine that origin with
`VITE_BASE_PATH`, without a hash route; one trailing slash is normalized. For
GitHub Pages:

```text
PRODUCTION_FRONTEND_ORIGIN=https://qiujiel.github.io
VITE_BASE_PATH=/future-ready-campus-quest/
ALLOWED_FRONTEND_ORIGINS=https://qiujiel.github.io
FRONTEND_APP_URL=https://qiujiel.github.io/future-ready-campus-quest
```

Join, recovery, student-login, and readiness secrets must be independently
generated, at least 32 bytes, and never reused from local, CI, or the load
project. `STUDENT_LOGIN_SIGNING_SECRET` exists only in the encrypted
`production-backend` environment and the encrypted Edge Function secret; it
never enters repository variables or secrets, `load-test`,
`production-readiness`, `github-pages`, any `VITE_*` value, the frontend bundle,
artifacts, caches, logs, summaries, issues, or release records.

`PRODUCTION_SUPABASE_SECRET_KEY` belongs in `production-backend` only. It is
never a repository variable or secret and is forbidden from Pages, frontend,
logs, artifacts, caches, issues, and release records. The backend stores it as
the encrypted Function secret `FRCQ_SUPABASE_SECRET_KEY` alongside
`FRCQ_SUPABASE_PUBLISHABLE_KEY`; hosted Functions do not use legacy JWT keys.

## `production-readiness` environment

`production-readiness` is a distinct `main`-limited read-only gate. It never
receives the production privileged secret key.

### Variables

| Variable | Purpose |
| --- | --- |
| `PRODUCTION_SUPABASE_PROJECT_REF` | Exact production identity. |
| `PRODUCTION_FRONTEND_ORIGIN` | Expected HTTPS browser origin. |
| `PRODUCTION_CONTENT_VERSION` | Approved protected-content version key. |
| `PRODUCTION_SMOKE_TEACHER_ID` | Opaque production smoke-teacher UUID. |
| `PRODUCTION_SMOKE_COHORT_ID` | Opaque unarchived smoke cohort UUID. |

### Secrets

| Secret | Purpose |
| --- | --- |
| `PRODUCTION_READINESS_SECRET` | Authorizes only the readiness endpoint. |

## `github-pages` environment

`github-pages` is a distinct `main`-limited environment. It contains no
Supabase variable or secret and receives only the Pages write/OIDC permissions
needed to publish the verified immutable artifact.

### Variables

None.

### Secrets

None.

## Exclusions and verification

GitHub stores no backup, database connection string, Storage administration key,
encryption key, plaintext export, object path, or protected manifest. Do not
add any of them to Actions inputs, variables, secrets, artifacts, caches,
summaries, issues, or release records. The disposable preflight emits only its
permitted aggregate classification and never protected rows or identifiers.

Before release, verify every listed name and scope, exact project/URL mapping,
`main` branch scope, credential isolation, no Pages Supabase credential, no
production credential in `load-test`, and the protected backend's exact
SHA/ref/URL checks. These controls remain required even when disposable state
uses forward rebuild rather than restoration.
