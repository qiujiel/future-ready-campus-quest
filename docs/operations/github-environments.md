# GitHub Production Configuration

Configure these controls before either production workflow is dispatched. This
document inventories names and scopes only. Do not place secret values in Git,
workflow inputs, job summaries, issues, or release records.

The project reference `vadyhuipwbtgbzpeisbn` belongs only to the dedicated load
test project. It is prohibited as a production project by both release code and
operator review.

## Repository variables

| Name | Purpose | Required by |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public production API URL | backend validation, Pages build and preflight |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser key | backend validation, Pages build and preflight |
| `VITE_BASE_PATH` | Pages base path, including leading and trailing `/` | build and preflight |
| `LOAD_SUPABASE_PROJECT_REF` | Dedicated load project identity; must equal `vadyhuipwbtgbzpeisbn` | backend and production preflight separation |

## Repository secrets

No dedicated load-test or production credential belongs at repository scope.

## `load-test` environment

This environment is limited to `main` and is used only by the mandatory release
package load gate. Its synthetic teacher, cohort, group codes, and student
sessions are created for one run and deleted before the job exits.

Variable:

| Name | Validation |
| --- | --- |
| `LOAD_SUPABASE_PROJECT_REF` | exactly `vadyhuipwbtgbzpeisbn` |

Secrets:

| Name | Purpose |
| --- | --- |
| `LOAD_SUPABASE_URL` | Dedicated load API URL |
| `LOAD_SUPABASE_PUBLISHABLE_KEY` | Dedicated load browser key |
| `LOAD_SUPABASE_SECRET_KEY` | Modern dedicated load setup/cleanup key |

These values must identify the load project, never production. Rotate the load
credential after unintended disclosure. Do not store a legacy service-role key,
teacher access token, join token, cohort ID, or content-version ID. The one-time
`load-test-bootstrap.yml` workflow applies the reviewed schema and Functions to
the exact dedicated project using only the organization access token already
held in `production-backend`; it is removed after first successful release.

## Recovery workflow inputs

`backup_evidence_id`, `backup_created_at_utc`, `backup_archive_sha256`, and
`restore_rehearsal_evidence_id` are non-secret dispatch inputs to the protected
backend workflow. They are entered for one approved release and compared with
the separately held recovery record. They are not repository or environment
variables and are not repository or environment secrets.
`backup_created_at_utc` is the archive creation/completion time; the quiesced
recovery point remains a separate release-record field.

GitHub stores no backup archive, database connection string, database password,
Storage administration key, encryption recipient or private key, plaintext
export, object path, or protected manifest. Do not add any of those to Actions
inputs, variables, secrets, artifacts, caches, summaries, issues, or release
records. Input format and freshness validation does not establish that an
external archive or rehearsal exists; the `production-backend` reviewer must
verify that evidence independently.

## `production-backend` environment

Normal protection target:

- named production owner as required reviewer;
- prevent self-review;
- deployment branch limited to `main`;
- administrator bypass disabled where the repository plan exposes the control.

For the initial release only, the repository owner recorded the 2026-08-07
exception that waives the second-person PR and environment review. The
environment remains limited to `main`; automated checks, exact project identity,
and the protected workflow are still mandatory. The exception does not expose
or relocate any credential.

Variables:

| Name | Validation |
| --- | --- |
| `PRODUCTION_SUPABASE_PROJECT_REF` | exactly `ghohuwwjxgjqnbsauvzq` |
| `PRODUCTION_FRONTEND_ORIGIN` | deployed HTTPS origin, with no path |

Secrets:

| Name | Purpose |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | CLI authorization for the production organization |
| `PRODUCTION_SUPABASE_DB_PASSWORD` | linked migration access |
| `PRODUCTION_SUPABASE_SECRET_KEY` | modern `sb_secret_` server-only key for the bootstrap emptiness preflight and deployed Function admin operations |
| `PRODUCTION_READINESS_SECRET` | custom authorization for the least-privilege readiness endpoint |
| `ALLOWED_FRONTEND_ORIGINS` | exact browser origin only; no path or trailing slash |
| `FRONTEND_APP_URL` | full hosted application base URL, including the Pages base path |
| `JOIN_TOKEN_SIGNING_SECRET` | join-token signing secret |
| `RECOVERY_TOKEN_SIGNING_SECRET` | recovery-token signing secret |
| `STUDENT_LOGIN_SIGNING_SECRET` | private student-name lookup and returning-login rate-key signer |

`ALLOWED_FRONTEND_ORIGINS` must exactly equal `PRODUCTION_FRONTEND_ORIGIN`.
`FRONTEND_APP_URL` must combine that origin with `VITE_BASE_PATH`, without a
hash route; one trailing slash is accepted and normalized. For the intended
GitHub Pages site, configure the public values as follows:

```text
PRODUCTION_FRONTEND_ORIGIN=https://qiujiel.github.io
VITE_BASE_PATH=/future-ready-campus-quest/
ALLOWED_FRONTEND_ORIGINS=https://qiujiel.github.io
FRONTEND_APP_URL=https://qiujiel.github.io/future-ready-campus-quest
```

This distinction is required because browser CORS sends only an origin, while
join and recovery links must retain the repository Pages path. The backend
workflow validates the relationship before writing any Function secret.
Join, recovery, student-login, and readiness secrets must be
independently generated, at least 32 bytes, and never reused from local, CI, or
the load project. The backend workflow also installs
`PRODUCTION_READINESS_SECRET` as an Edge Function secret.

`STUDENT_LOGIN_SIGNING_SECRET` exists only as an encrypted
`production-backend` environment secret and as an encrypted Edge Function
secret. It must not exist in repository variables or secrets, the `load-test`,
`production-readiness`, or `github-pages` environments, any `VITE_*` value,
the frontend bundle, artifacts, caches, logs, summaries, issues, or release
records. Local CI/package/release verification uses distinct test-only values
written to its temporary Function environment file and removes that file after
the run.

`PRODUCTION_SUPABASE_SECRET_KEY` belongs in `production-backend only`.
Never put it in a repository variable or a repository secret. It is forbidden
from `production-readiness`, `github-pages`, frontend values or bundles, logs,
job summaries, artifacts, caches, issues, and release records. The bootstrap
and Function-secret steps receive it only as an environment secret and never
print it. Rotate it after any unintended disclosure,
then treat the event as a credential incident.

The backend release also installs the same credential under the application
name `FRCQ_SUPABASE_SECRET_KEY`, alongside
`FRCQ_SUPABASE_PUBLISHABLE_KEY`, as encrypted Function secrets. Production
Functions prefer those modern keys. Provider-injected legacy JWT keys remain a
local-development fallback only and must not be used by hosted production code.

## `production-readiness` environment

This is a separate read-only review gate limited to `main`. Its normal policy is
a named reviewer with self-review prevention; the recorded 2026-08-07 owner
exception waives that second person for the initial release without weakening
the automated readiness checks.

Variables:

| Name | Purpose |
| --- | --- |
| `PRODUCTION_SUPABASE_PROJECT_REF` | exact production identity |
| `PRODUCTION_FRONTEND_ORIGIN` | expected HTTPS browser origin |
| `PRODUCTION_CONTENT_VERSION` | approved protected-content version key |
| `PRODUCTION_SMOKE_TEACHER_ID` | opaque production smoke teacher UUID |
| `PRODUCTION_SMOKE_COHORT_ID` | opaque unarchived smoke cohort UUID owned by that teacher |

Secret:

| Name | Purpose |
| --- | --- |
| `PRODUCTION_READINESS_SECRET` | authorizes only the `production-readiness` Edge endpoint |

The preflight prints only project identity, counts,
migration/function/schedule status, and endpoint status. It must not print this
key or protected record contents. The production privileged secret key is not
available to this environment; the endpoint uses its provider-injected
credential internally for the one readiness RPC.

## `github-pages` environment

The normal policy uses a named publication reviewer and prevents self-review.
For the recorded 2026-08-07 owner exception, keep the environment restricted to
`main` with no Supabase variable or secret even though the second person is
waived. The job receives only the Pages write and OIDC permissions required by
`actions/deploy-pages`.

## Configuration verification

Before release, the repository administrator verifies the inventory below. A
second reviewer normally repeats it; for the recorded 2026-08-07 exception the
owner performs and records the comparison once:

- all names above exist at the specified scope;
- no production credential exists as a repository secret when an environment
  secret is specified;
- the production project URL equals
  `https://ghohuwwjxgjqnbsauvzq.supabase.co` exactly;
- the load URL contains `vadyhuipwbtgbzpeisbn` and the production URL does not;
- each environment has the `main` branch rule and either its normal required
  reviewer or the recorded initial-release owner exception;
- `github-pages` contains no Supabase credential;
- `STUDENT_LOGIN_SIGNING_SECRET` exists only in `production-backend` and is
  absent from every Pages/frontend scope;
- the four recovery values are supplied only as per-run non-secret workflow
  inputs and match the separately held release record;
- no backup, connection string, Storage administration key, encryption key, or
  protected manifest exists in any GitHub scope;
- workflow Actions are allowed to run and GitHub Pages uses GitHub Actions as
  its source.

Record verification time and the reviewer or exception owner in the release
checklist, not the values that were inspected.
