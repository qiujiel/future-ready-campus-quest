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
| `LOAD_COHORT_ID` | Non-production load fixture | release package live-load gate |
| `LOAD_CONTENT_VERSION_ID` | Non-production load content fixture | release package live-load gate |
| `LOAD_TEST_ENABLED` | Optional `true` switch for ordinary CI | ordinary CI only |

## Repository secrets

| Name | Purpose |
| --- | --- |
| `LOAD_SUPABASE_URL` | Dedicated load API URL |
| `LOAD_SUPABASE_ANON_KEY` | Dedicated load public key |
| `LOAD_SUPABASE_SERVICE_ROLE_KEY` | Dedicated load setup/verification credential |
| `LOAD_TEACHER_ACCESS_TOKEN` | Dedicated load teacher fixture credential |
| `LOAD_JOIN_TOKEN` | Dedicated load cohort join token |

These values must identify the load project, never production. Rotate the load
fixture credentials after unintended disclosure or a shared rehearsal.

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

Required protection:

- named production owner as required reviewer;
- prevent self-review;
- deployment branch limited to `main`;
- administrator bypass disabled where the repository plan exposes the control.

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
| `PRODUCTION_READINESS_SECRET` | custom authorization for the least-privilege readiness endpoint |
| `ALLOWED_FRONTEND_ORIGINS` | Edge Function CORS allow-list |
| `FRONTEND_APP_URL` | recovery-link frontend origin |
| `JOIN_TOKEN_SIGNING_SECRET` | join-token signing secret |
| `RECOVERY_TOKEN_SIGNING_SECRET` | recovery-token signing secret |

`ALLOWED_FRONTEND_ORIGINS` and `FRONTEND_APP_URL` must agree with
`PRODUCTION_FRONTEND_ORIGIN`. Signing and readiness secrets must be
independently generated, at least 32 bytes, and never reused from local, CI, or
the load project. The backend workflow also installs
`PRODUCTION_READINESS_SECRET` as an Edge Function secret.

## `production-readiness` environment

This is a separate read-only review gate. It requires a named reviewer,
prevents self-review, and is limited to `main`.

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
key or protected record contents. No production service-role credential is
stored in GitHub; the endpoint uses its provider-injected credential internally
for the one readiness RPC.

## `github-pages` environment

Require a named publication reviewer, prevent self-review, restrict to `main`,
and disable administrator bypass where supported. Store no Supabase variable or
secret in this environment. The job receives only the Pages write and OIDC
permissions required by `actions/deploy-pages`.

## Configuration verification

Before release, a repository administrator and a second reviewer verify:

- all names above exist at the specified scope;
- no production credential exists as a repository secret when an environment
  secret is specified;
- the production project URL equals
  `https://ghohuwwjxgjqnbsauvzq.supabase.co` exactly;
- the load URL contains `vadyhuipwbtgbzpeisbn` and the production URL does not;
- each environment has the required reviewer and branch rule;
- `github-pages` contains no Supabase credential;
- the four recovery values are supplied only as per-run non-secret workflow
  inputs and match the separately held release record;
- no backup, connection string, Storage administration key, encryption key, or
  protected manifest exists in any GitHub scope;
- workflow Actions are allowed to run and GitHub Pages uses GitHub Actions as
  its source.

Record verification time and reviewer names in the release checklist, not the
values that were inspected.
