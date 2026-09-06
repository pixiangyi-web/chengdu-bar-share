const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

function base64urlBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(normalized + padding), (char) => char.charCodeAt(0));
}

function decode(value) {
  try { return JSON.parse(new TextDecoder().decode(base64urlBytes(value))); } catch { return null; }
}

async function identity(request, env) {
  try {
    const value = request.headers.get("x-session-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const [payload, signature] = String(value || "").split(".");
    if (!payload || !signature) return null;
    const secret = env.SESSION_SECRET || env.WECHAT_APPSECRET;
    if (!secret) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, base64urlBytes(signature), new TextEncoder().encode(payload));
    const data = decode(payload);
    return valid && data?.openid && data.exp > Math.floor(Date.now() / 1000) ? data.openid : null;
  } catch (error) {
    console.warn("[profile auth] invalid session", error);
    return null;
  }
}

const emptyProfile = { wanted: [], visited: [], rated: [] };

export async function onRequestGet({ request, env }) {
  const openid = await identity(request, env);
  if (!openid) return json({ error: "unauthorized" }, 401);
  try {
    const row = await env.DB.prepare("SELECT profile FROM user_profiles WHERE openid=? LIMIT 1").bind(openid).first();
    let profile = emptyProfile;
    if (row?.profile) {
      try { profile = JSON.parse(row.profile); } catch { profile = emptyProfile; }
    }
    return json({ profile });
  } catch (error) {
    console.error("[profile GET]", error);
    return json({ error: "profile unavailable" }, 503);
  }
}

export async function onRequestPut({ request, env }) {
  const openid = await identity(request, env);
  if (!openid) return json({ error: "unauthorized" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  try {
    const input = body.profile || {};
    const profile = {
      wanted: Array.isArray(input.wanted) ? input.wanted.slice(0, 500) : [],
      visited: Array.isArray(input.visited) ? input.visited.slice(0, 500) : [],
      rated: Array.isArray(input.rated) ? input.rated.slice(0, 500) : []
    };
    await env.DB.prepare("INSERT OR REPLACE INTO user_profiles (openid,profile,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)").bind(openid, JSON.stringify(profile)).run();
    return json({ ok: true });
  } catch (error) {
    console.error("[profile PUT]", error);
    return json({ error: "profile unavailable" }, 503);
  }
}
