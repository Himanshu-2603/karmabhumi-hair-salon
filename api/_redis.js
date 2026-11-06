'use strict';
/* Tiny Upstash/Vercel-KV REST client (no npm packages needed). */
function pick(re, exclude) {
  const k = Object.keys(process.env).find((n) => re.test(n) && !(exclude && exclude.test(n)) && process.env[n]);
  return k ? process.env[k] : '';
}
function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || pick(/REST(_API)?_URL$/);
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || pick(/REST(_API)?_TOKEN$/, /READ_ONLY/);
  return { url: String(url || '').replace(/\/+$/, ''), token };
}
const configured = () => { const c = creds(); return !!(c.url && c.token); };

async function redis(cmd) {
  const { url, token } = creds();
  if (!url || !token) { const e = new Error('Storage not connected'); e.code = 503; throw e; }
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error(j.error || 'Storage error'); e.code = 502; throw e; }
  return j.result;
}
module.exports = { redis, configured };
