# Rollback and Recovery

## Immediate containment

1. Close every open join window and pause new quest starts.
2. Revoke exposed join/recovery material by closing the relevant window or
   issuing a replacement recovery token. Raw tokens must never enter the
   incident record.
3. If authorization behavior is uncertain, disable the affected Edge Function
   and keep the prior verified web artifact live.

## Application rollback

GitHub Pages deployment must use immutable CI artifacts. Restore the last
known-good artifact and checksum; do not rebuild an old commit with current
dependencies or environment variables.

## Database rollback

Supabase migrations are forward-only in production. Prepare a reviewed
compensating migration that restores the prior contract without deleting
immutable responses, evidence, scores, or audits. Test it against a restored
backup in the non-production project before applying it. Never use a
destructive local reset against production.

For a failed additive migration:

1. stop callers of the new RPC/function;
2. deploy compatibility code that tolerates both schemas;
3. apply the compensating migration;
4. rerun pgTAP privacy and ownership tests;
5. re-enable traffic only after teacher and student smoke checks pass.

## Data recovery

Restore databases or Storage only from the documented project backup.
Reconcile group images by opaque object path and verify signed-URL access.
Preserve immutable response evidence unless the authorized data owner has
requested deletion. Recovery must not re-open expired join/recovery tokens.

## Exit criteria

The owning teacher can sign in, unauthorized callers receive neutral errors,
joining is closed by default, C1–C8 evidence remains consistent, and the
verified prior application artifact is serving. Record the affected commit,
migration, artifact checksum, timestamps, and opaque IDs in the incident log.
