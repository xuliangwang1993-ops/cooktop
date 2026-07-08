// Minimal Cloudflare Worker that proxies the Cooktop app's chat requests to DeepSeek.
// The DeepSeek API key lives ONLY in the Worker secret (env.DEEPSEEK_KEY) — never in the
// app, never in git. Use this when you want the key off the client (e.g. phones) or if a
// browser is ever blocked by CORS. Deploy steps are in README.md.

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
    if (!env.DEEPSEEK_KEY) return json({ error: { message: 'Worker is missing the DEEPSEEK_KEY secret. Run: wrangler secret put DEEPSEEK_KEY' } }, 500);

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: { message: 'Body must be JSON' } }, 400); }
    if (!payload.model) payload.model = 'deepseek-chat';

    // Forward to DeepSeek with the key injected server-side.
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.DEEPSEEK_KEY },
      body: JSON.stringify(payload),
    });

    // Relay DeepSeek's response (status + body) back to the browser, with CORS headers.
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  },
};
