# Production source and deployment gate

## Current source

`worker.js` is the exact production module observed after the 22 November 2026 shared Tasks deployment. It includes the existing MesaStore, booking delivery and acknowledgement flows, Gym/Golf restrictions, Outdoors mapping, calendar fixes, and the isolated shared Google connector.

- Observed modification time: `2026-11-22T17:07:27.02401Z`
- SHA-256: `1e305895c180bb7ad7b626ada892df60f3190a018566193a9fb458d43f2b1642`
- Size: 141607 bytes
- Deployment metadata: `deployment/source-baseline.json`
- Observed settings and all 14 binding identities: `deployment/observed-settings-2026-11-22.json`

Secret bindings are represented only by name and type. No secret values are included.

## Deployment is deliberately blocked

This revision repairs source provenance. It does not deploy, provision storage, run migrations, or connect the shared Google account.

The prior repo config was unsafe for the deployed service: it omitted MESA_STORE and its source lacked production features. The current Durable Object migration history was not available in the recovered settings. A namespace ID alone is not evidence of its migration history or storage type.

Two independent local guards stop routine deployment:

1. `npm run deploy` exits with an explicit blocked message, without starting Wrangler.
2. `wrangler.toml` names a deliberately absent entrypoint, so a direct default `wrangler deploy` cannot bundle the service.

The `MESA_STORE` class binding is recorded in the config; its observed namespace ID is preserved in the settings snapshot. No migration tag, storage type, replacement namespace, or new namespace has been guessed. Existing TOKENS namespace identity is retained.

These guards prevent accidental deployment through the documented/default paths. They are not security controls against a person deliberately supplying another `--main` or alternate config.

## Before enabling any deployment

Recover the existing service's actual migration history and full deployment metadata from an authorized source. Verify the existing MESA_STORE namespace, class and storage type, plus all bindings, secrets, compatibility settings and triggers against the current production service. Resolve any drift without creating replacement storage or re-running an invented migration.

Only after independent review should a separate change restore `main = "worker.js"`, supply a verified deployment configuration and replace the blocked npm command. Update the source-baseline test deliberately for any authorized source revision. Do not create the missing guard file simply to get a deploy command to pass.

No deployment token is needed to run the offline checks. Previously created temporary tokens remain revoked.

## Offline verification

From `worker/`:

```sh
npm test
npm run check:source
npm run deploy  # expected to exit 1; no network or deployment
```

The regression tests simulate Google, Gmail, Notion, KV and the actual MesaStore storage interface. They make no real task/calendar writes.

The original regression suite through booking-request handling is retained. Provider parser fixtures are retained. The original seven-message booking fixture now runs through the real MesaStore with store-level assertions for cancellation, date replacement, acknowledgement, rescan rebuild, duplicate prevention and late-device recovery. Obsolete assertions that the booking-mail scanner must write directly to Calendar are replaced with the current fail-closed missing-store assertion and explicit no-Calendar checks. The route fixtures also cover the current scan-to-store-to-device-ack flow, late devices, reject/restore, absence of premature mail marks, and absence of Calendar side effects. Shared fixtures cover isolated credentials, exact shared-account selection, pagination including completed/hidden tasks, date-only due dates, Madrid completion dates, minimal etag-protected writes and read-only shared calendar access.
