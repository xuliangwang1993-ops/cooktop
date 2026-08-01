// Minimal Cloudflare Worker that proxies the Cooktop app's chat requests to Kimi (Moonshot).
// The Kimi API key lives ONLY in the Worker secret (env.KIMI_KEY) — never in the
// app, never in git. Use this when you want the key off the client (e.g. phones) or if a
// browser is ever blocked by CORS. Deploy steps are in README.md.

// Keys from platform.moonshot.cn use api.moonshot.cn; keys from the international
// platform (platform.moonshot.ai) should switch this to api.moonshot.ai.
const KIMI_ENDPOINT = 'https://api.moonshot.cn/v1/chat/completions';

const CORS = {
  'Access-Control-Allow-Origin': '*',            // tighten to your Pages origin if you like
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return json({ error: { message: 'Use POST' } }, 405);
    if (!env.KIMI_KEY) return json({ error: { message: 'Worker is missing the KIMI_KEY secret. Run: wrangler secret put KIMI_KEY' } }, 500);

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: { message: 'Body must be JSON' } }, 400); }
    if (!payload.model) payload.model = 'kimi-k3';

    // Forward to Kimi with the key injected server-side.
    const upstream = await fetch(KIMI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.KIMI_KEY },
      body: JSON.stringify(payload),
    });

    // Relay Kimi's response (status + body) back to the browser, with CORS headers.
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  },
};
