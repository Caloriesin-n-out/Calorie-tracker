# Recovered backend and shared-task candidate, 22 November 2026

Source recovery and review archive only. Nothing in this archive has been deployed.

## Exact versions

- `deployed-baseline.mjs`: complete recovered deployed module, SHA256 `2ce52ef1216c4a64a6457a9603b3431de91ea46574327f412b1820f166570527`.
- `worker-shared-prepared.mjs`: reviewed additive shared-task candidate, SHA256 `1e305895c180bb7ad7b626ada892df60f3190a018566193a9fb458d43f2b1642`.
- `shared.diff`: candidate changes against that exact baseline.
- `deployment-baseline.json` and `settings-baseline.json`: scrubbed binding metadata from the deployed baseline. They contain no secret values.

The recovered source includes MesaStore, current acknowledgement-driven booking delivery/import, gym/golf restricted connections, Outdoors support, calendar metadata, and validated calendar writes. Those sections must not be replaced by the older `worker/worker.js` on main.

## Deployment warning

The repository's old `worker/wrangler.toml` lacks MESA_STORE and is NOT safe for deployment. This archive does not repair that config or establish the live Durable Object migration tag. Do not invent a migration or create, rename or delete any existing Durable Object namespace.

Any authorized deployment must first re-read current deployed source/settings for drift, preserve the existing TOKENS and MESA_STORE namespace identifiers and all existing bindings/secrets, use the established API metadata upload method, omit secret values as that method requires, then compare post-deployment settings. No new binding is needed for the shared connector, which uses new namespaced keys in existing TOKENS storage. No Google consent or live account/list selection has taken place.

## Reproduce offline

Requires Python 3 and Node.js 22 or newer. Tests intercept all external requests with fixtures. No account credentials or network access are needed.

```sh
python3 prepare_live_bundle_shared.py deployed-baseline.mjs rebuilt.mjs
node --check rebuilt.mjs
node test_live_shared_backend.mjs rebuilt.mjs
node test_live_shared_routes.mjs rebuilt.mjs
```

The transformer fails closed on any other baseline hash. It applies eleven exact anchored edits and appends the connector, then reverses those edits to prove every unrelated source byte is preserved.

The shared helper tests cover identity verification before grant storage, wrong-account refusal, grant namespace isolation, unknown-service rejection, task pagination, completed/hidden task flags, deleted task filtering, date-only due dates, Madrid completion dates, etag checks and minimal completion patches, chosen-list isolation, omission of private notes from new shared tasks, and a read-only shared calendar.

The current-module route tests cover app-key protection, valid scoped Gym/Golf keys rejected from shared routes, real MesaStore delivery/list/acknowledgement/late-device/reject/restore, existing calendar completion validation, readonly/unknown calendar refusal without fallback to primary, shared GET/add/done/reopen routing, the original personal Calendar callback grant isolation, and booking-email scan through the real store to acknowledgement without Calendar side effects or premature mail handling marks.

The old repository test suite reaches an expected mismatch at its old booking-scan assumptions: it supplies no MESA_STORE and expects the previous calendar-writing importer. It fails identically on the unmodified recovered baseline and candidate. The new fixtures exercise the actual current importer/store design instead.

## Still unverified live

Google Cloud Tasks API availability for the existing project; actual shared-account consent and granted scopes; owner selection of an existing task list; real provider task create/complete/reopen behaviour, including conditional-write enforcement; phone end-to-end shared data display. These are not claimed complete by the offline tests.
