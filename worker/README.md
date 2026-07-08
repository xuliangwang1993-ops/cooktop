# Cooktop DeepSeek Worker proxy (Option ②)

A tiny Cloudflare Worker that forwards the app's chat requests to DeepSeek, keeping the
API key server-side (in a Worker **secret**). Use it when you don't want the key in the
browser (e.g. sharing the app on phones) or if a browser is ever blocked by CORS.

> You don't strictly need this. DeepSeek allows direct browser calls (CORS is open), so
> the app works with just a key entered in the browser. This proxy is the optional,
> more-shareable path.

## Deploy (one time)

1. Install Wrangler and log in to your Cloudflare account:
   ```
   npm install -g wrangler
   wrangler login
   ```

2. From this `worker/` folder, set your DeepSeek key as a secret (you'll be prompted to
   paste it — it is stored by Cloudflare, never in this repo):
   ```
   wrangler secret put DEEPSEEK_KEY
   ```

3. Deploy:
   ```
   wrangler deploy
   ```
   Wrangler prints the URL, e.g. `https://cooktop-deepseek-proxy.<your-subdomain>.workers.dev`.

## Point the app at it

Open the Cooktop app → **Settings → DEEPSEEK (LIVE DELEGATE) → Worker proxy (optional)**
and paste the Worker URL. From then on the app calls the Worker (no key in the browser);
the Worker injects the key and forwards to DeepSeek. Clear the field to go back to direct.

## Test the Worker directly

```
curl -X POST https://YOUR-WORKER-URL \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```
A JSON completion means it works. `500 … missing the DEEPSEEK_KEY secret` means step 2 was skipped.
