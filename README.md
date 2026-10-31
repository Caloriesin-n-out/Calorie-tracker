# Calorie tracker

A small personal app for an Android phone: log what you eat in a few taps, see it next to the calories your Fitbit Air says you burned, plus steps, sleep and resting heart rate.

| Part | Where it lives | What it does |
|---|---|---|
| The app (`index.html`, `manifest.webmanifest`, `sw.js`, icons) | **GitHub Pages**, from `main` / root | The installable app. Your food log is stored on the phone. |
| `worker/` | **Cloudflare Worker** (free) | Holds your Google credentials and fetches Fitbit Air data. Pages can't do this: it only serves files. |

**No health data is ever stored in this repo.** It only holds code. The repo can safely be public (Pages on a free account needs that).

## Important: the old Fitbit API is going away
Google switches off the legacy Fitbit Web API on **2 Nov 2026**. Fitbit Air data is only available through the **Google Health API**, so that is what the Worker uses. Google said in May it was "not currently onboarding new projects", so step 2 below is the one that might block you. See "Not yet verified".

## Updating the app (automatic)
Any change pushed to `main` is published by GitHub Pages in 1 to 2 minutes. The service worker is network-first, so a reload picks it up. Bump `BUILD` in `index.html` so Settings shows which version the phone is running. The Worker (`worker/`) changes rarely and is redeployed by hand with `wrangler deploy`.

## One-time setup

### 1. Publish the app on GitHub Pages
1. Create an empty public repository on github.com named `Calorie-tracker` (no README, no licence).
2. Push this folder to it (Claude does this for you).
3. Repo **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch `main`, folder `/ (root)`, Save.
4. Your app address is `https://caloriesin-n-out.github.io/Calorie-tracker/` (the repo name is case-sensitive in the address). The repo lives in its own `Caloriesin-n-out` organisation so the app has an address of its own; Chrome on the Pixel kept refusing to install from the `mhoman05` and `Matthias-Sport` addresses with an "already installed" message.

### 2. Google Cloud: enable the API and create credentials
1. Go to <https://console.cloud.google.com> and create a project.
2. **APIs & Services → Library** → "Google Health API" → **Enable**. If it isn't listed or won't enable, Google hasn't opened it to your project yet. Stop and see "Not yet verified".
3. **OAuth consent screen**: user type **External**; add your own Google account under **Test users**.
4. **Data Access**: add the three `googlehealth.` scopes (activity_and_fitness, sleep, health_metrics_and_measurements, all read-only).
5. **Credentials → Create credentials → OAuth client ID → Web application**. Authorised redirect URI: `https://calorie-tracker.<your-subdomain>.workers.dev/auth/callback` (the address from step 3). Copy the client ID and secret.

> **7-day expiry:** while the consent screen is in *Testing*, Google ends the connection every 7 days and you tap "Connect Google Health" again. Setting the status to **In production** (you can leave it unverified; you just click through an "unverified app" warning) stops that.

### 3. Deploy the Worker
```bash
cd worker
npx wrangler login
npx wrangler kv namespace create TOKENS      # paste the id into wrangler.toml
# also set ALLOWED_ORIGIN in wrangler.toml to https://<owner>.github.io  (origin only, no path)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put APP_KEY              # a long passphrase of your choosing; it protects your health data
npx wrangler deploy
```
`deploy` prints the Worker address. Make sure the redirect URI from step 2.5 matches it exactly.

### 4. Install on your Pixel and connect
1. Open the app address in Chrome. Close the tab, reopen, reload twice, then **⋮ → Install app**.
2. Open the installed app → **Settings**: paste the Worker address and your `APP_KEY`, **Save**.
3. **Connect Google Health** → approve in Google → "Connected ✓".
4. Back in the app: **Check connection**, then **Sync last 30 days**.

If the install option is missing, see "Install troubleshooting".

## Using it
- **+ Add food** looks in tiers: your own saved foods, foods you added by hand, ~40 common foods, then packaged products.
  - **Scan**: point the camera at a barcode (or type the digits). The product comes from Open Food Facts with calories, protein, carbs and fat per 100 g. Enter the grams you had and see the total live. If a product has no serving size, the app says so and asks for grams instead of guessing.
  - **Search online** (needs the Worker): finds packaged products by name. Results go through the same grams screen.
  - Anything logged by weight is remembered in **My foods** with the grams you used last time, so the next time is one tap. Your own corrected numbers always win over the online ones.
  - Not listed? Type a name and calories, and optionally protein, carbs and fat.
  - Logging the same food again in the same meal raises its count instead of adding a duplicate row. **Copy yesterday** repeats a whole meal.
- Tap a logged item to fix its grams, per-100 g numbers, quantity or meal, or delete it. Fixing a scanned food's numbers also updates the saved food. Adds, copies and deletes have Undo.
- Open Food Facts is crowd-sourced, so check a scanned product against its pack the first time.
- **Trends**: eaten vs burned over 7, 14 or 30 days. Today is excluded (unfinished) and days with no food logged are skipped, not counted as 0.
- **Body and recovery** (Today and Trends): active calories, weight, body fat, heart rate variability, blood oxygen, breathing rate and skin temperature, when your Fitbit sends them. Nothing shows for a number Google has no data for; **Settings → What your Fitbit has sent** lists which ones have arrived. Weight and body fat are shown as the latest reading, labelled with its date. No new Google permission is needed.
- **Settings → Export backup** saves your food log as a file. The log lives on the phone, so do this now and then, and **always before changing the app's web address** (storage belongs to the address).
- **Settings → Load demo data** previews the charts. Remove it from the same place.

## Not yet verified
Not yet run against a real Google Health account. Tested: the Worker's login, token refresh and caching, parsing, 14-day chunking, expired-connection handling and CORS against a simulated Google; the app in a phone-sized browser; the manifest, icons and page head. **Not** tested: the service worker (the test browser can't run one), installing on a real Android phone, and:
- whether Google lets a new personal project use the Health API;
- the exact field names for daily step and calorie totals (the parser accepts several spellings; `/api/raw` shows Google's real reply);
- the scope URLs. The Worker assumes `https://www.googleapis.com/auth/googlehealth.<name>.readonly`. If Google rejects them, copy the exact strings from your Data Access page into `SCOPES` in `worker/wrangler.toml`.

Raw reply for debugging (types: `steps`, `total-calories`, `active-energy-burned`, `sleep`, `weight`, `body-fat`, and any `daily-…` type such as `daily-resting-heart-rate`, `daily-heart-rate-variability`, `daily-oxygen-saturation`, `daily-respiratory-rate`, `daily-sleep-temperature-derivations`):
```bash
curl -H "X-App-Key: YOUR_APP_KEY" "https://YOUR-WORKER/api/raw?type=steps&from=2026-10-29&to=2026-10-30"
```

## Install troubleshooting (from the GolfCaddie fix)
- `index.html` must start with `<!doctype html>`, with no stray character before it. Otherwise the `<head>` ends up empty and Chrome never sees the manifest. Check: `head -c 40 index.html | od -c`.
- On the live page, in a desktop browser console: `({ head: document.head.children.length, manifest: !!document.head.querySelector('link[rel=manifest]'), compat: document.compatMode })` should show 10+ head children, `true`, and `CSS1Compat`.
- Manifest, icons and `sw.js` must be real files in the repo root. Never build them from JavaScript blobs. `start_url` and `scope` must stay inside the repo folder (`./`).
- On the phone, `chrome://webapks` lists installed web apps. On a computer, F12 → Application → Manifest → Installability gives Chrome's own reason.
- Icons are regenerated with `python3 scripts/make-icons.py` (needs Pillow).

## Design notes
- The phone is the source of truth for the food log; nothing in it is ever read back from a server, so deleted items can't reappear. Deletes are tombstones; backups never resurrect them.
- Calories are stored per item with a quantity; the per-item number is directly editable.
- Sync outcome (success, partial, failed, needs reconnect) is stored with a timestamp and shown in Settings. A failure never shows as "updated".
- The service worker is network-first. The build number is in Settings, with a **Force refresh** button.
- The Google refresh token and client secret live only on the Worker.
