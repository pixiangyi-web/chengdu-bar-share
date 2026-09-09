import { configured, failure } from "../../lib/payment.js";
const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

function bytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), char => char.charCodeAt(0));
}

async function identity(request, env) {
  try {
    const token = request.headers.get("x-session-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const [payload, signature] = String(token || "").split(".");
    const secret = env.SESSION_SECRET || env.WECHAT_APPSECRET;
    if (!payload || !signature || !secret) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, bytes(signature), new TextEncoder().encode(payload));
    const data = JSON.parse(new TextDecoder().decode(bytes(payload)));
    return valid && data.exp > Math.floor(Date.now() / 1000) ? data.openid : null;
  } catch { return null; }
}

export async function onRequestGet({ request, env }) {
  const openid = await identity(request, env);
  if (!openid) return json({ error: "unauthorized" }, 401);
  try {
    const row = await env.DB.prepare("SELECT product_id,status,created_at,updated_at FROM memberships WHERE openid=? LIMIT 1").bind(openid).first();
    return json({ member: Boolean(row && row.status === "active"), membership: row || null, required: env.MEMBERSHIP_REQUIRED === "true", paymentEnabled: configured(env) && env.PAYMENT_ENABLED === "true", priceFen: 188 });
  } catch (error) { return failure(error); }
}
