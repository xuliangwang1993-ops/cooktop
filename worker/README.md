# Cooktop Kimi Worker proxy (Option ②)

A tiny Cloudflare Worker that forwards the app's chat requests to Kimi (Moonshot AI),
keeping the API key server-side (in a Worker **secret**). Use it when you don't want the
key in the browser (e.g. sharing the app on phones) or if a browser is ever blocked by CORS.

> You don't strictly need this if direct browser calls to Moonshot work from your network.
> If the browser is blocked by CORS, this proxy is the reliable, more-shareable path.

The Worker forwards to `https://api.moonshot.cn/v1/chat/completions` (model `kimi-k3`).
If your key is from the international platform (platform.moonshot.ai), change
`KIMI_ENDPOINT` in `worker.js` to `https://api.moonshot.ai/v1/chat/completions`.

## Deploy (one time)

1. Install Wrangler and log in to your Cloudflare account:
   ```
   npm install -g wrangler
   wrangler login
   ```

2. From this `worker/` folder, set your Kimi key as a secret (you'll be prompted to
   paste it — it is stored by Cloudflare, never in this repo):
   ```
   wrangler secret put KIMI_KEY
   ```

3. Deploy:
   ```
   wrangler deploy
   ```
   Wrangler prints the URL, e.g. `https://cooktop-kimi-proxy.<your-subdomain>.workers.dev`.

## Point the app at it

Open the Cooktop app → **Settings → KIMI K3 (LIVE DELEGATE) → Worker proxy (optional)**
and paste the Worker URL. From then on the app calls the Worker (no key in the browser);
the Worker injects the key and forwards to Kimi. Clear the field to go back to direct.

## Test the Worker directly

```
curl -X POST https://YOUR-WORKER-URL \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```
A JSON completion means it works. `500 … missing the KIMI_KEY secret` means step 2 was skipped.
