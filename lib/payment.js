export const PRODUCT = Object.freeze({ id: "permanent_member", price: 100, quantity: 1, env: 0 });
export const json = (value, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
export class PaymentError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
const encoder = new TextEncoder();
export async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))), n => n.toString(16).padStart(2, "0")).join("");
}
function decode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
}
export async function identity(request, env) {
  try {
    const token = request.headers.get("x-session-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const parts = String(token || "").split(".");
    const secret = env.SESSION_SECRET || env.WECHAT_APPSECRET;
    if (parts.length !== 2 || !secret) return null;
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, decode(parts[1]), encoder.encode(parts[0]))) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    return typeof payload.openid === "string" && payload.openid && Number.isFinite(payload.exp) && payload.exp > Date.now() / 1000 ? payload.openid : null;
  } catch { return null; }
}
export function configured(env) {
  return Boolean(env.DB && env.WECHAT_OFFER_ID && env.WECHAT_APP_KEY && env.WECHAT_APPSECRET && env.WECHAT_NOTIFY_TOKEN);
}
export async function member(env, openid) {
  if (!openid) return false;
  const row = await env.DB.prepare("SELECT status FROM memberships WHERE openid=?").bind(openid).first();
  return row?.status === "active";
}
export async function requireMembership(request, env) {
  if (env.MEMBERSHIP_REQUIRED !== "true") return null;
  const openid = await identity(request, env);
  if (!openid) return json({ error: "wechat auth required", code: "WECHAT_AUTH_REQUIRED" }, 401);
  try {
    return await member(env, openid) ? null : json({ error: "请先在小程序开通会员", code: "MEMBERSHIP_REQUIRED" }, 403);
  } catch { return json({ error: "会员服务暂不可用" }, 503); }
}
export async function payData(env, sessionKey, orderId) {
  const signData = JSON.stringify({ offerId: String(env.WECHAT_OFFER_ID), buyQuantity: PRODUCT.quantity, env: PRODUCT.env, currencyType: "CNY", productId: PRODUCT.id, goodsPrice: PRODUCT.price, outTradeNo: orderId, attach: orderId });
  return { mode: "short_series_goods", signData, paySig: await hmac(`requestVirtualPayment&${signData}`, env.WECHAT_APP_KEY), signature: await hmac(signData, sessionKey) };
}
async function wechatJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new PaymentError("微信支付服务暂不可用");
  const result = await response.json();
  if (result.errcode) throw new PaymentError(`微信支付接口错误 (${result.errcode})`);
  return result;
}
export async function loginForPayment(env, code, openid) {
  const params = new URLSearchParams({ appid: env.WECHAT_APPID || "wxc634ef27c14ed031", secret: env.WECHAT_APPSECRET, js_code: code, grant_type: "authorization_code" });
  const result = await wechatJson(`https://api.weixin.qq.com/sns/jscode2session?${params}`);
  if (result.openid !== openid || !result.session_key) throw new PaymentError("微信身份已变化，请重新登录", 401);
  return result.session_key;
}
export async function xpay(env, path, data) {
  // stable_token avoids invalidating tokens used by other concurrent requests.
  const credential = await wechatJson("https://api.weixin.qq.com/cgi-bin/stable_token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "client_credential", appid: env.WECHAT_APPID || "wxc634ef27c14ed031", secret: env.WECHAT_APPSECRET, force_refresh: false }) });
  if (!credential.access_token) throw new PaymentError("微信支付凭证获取失败");
  const body = JSON.stringify(data);
  const params = new URLSearchParams({ access_token: credential.access_token, pay_sig: await hmac(`${path}&${body}`, env.WECHAT_APP_KEY) });
  return wechatJson(`https://api.weixin.qq.com${path}?${params}`, { method: "POST", headers: { "content-type": "application/json" }, body });
}
export function validateOrder(local, remote) {
  if (!remote || remote.order_id !== local.out_trade_no || remote.env_type !== 1 || ![0, 7].includes(remote.order_type) || remote.order_fee !== local.amount || !remote.wx_order_id) {
    throw new PaymentError("订单核验不一致", 409);
  }
  if (local.wx_order_id && local.wx_order_id !== remote.wx_order_id) throw new PaymentError("平台订单号不一致", 409);
  if ([5, 8].includes(remote.status)) return "refunded";
  if ([2, 3, 4, 7].includes(remote.status) && remote.paid_fee === local.amount) return "fulfilled";
  if (remote.status === 6) return "closed";
  return "pending";
}
export async function reconcile(env, local, call = xpay) {
  const result = await call(env, "/xpay/query_order", { openid: local.openid, env: 0, order_id: local.out_trade_no });
  const status = validateOrder(local, result.order);
  // D1 batch is transactional. A delayed paid response can never resurrect a refund.
  await env.DB.batch([
    env.DB.prepare("UPDATE payment_orders SET status=CASE WHEN status='refunded' THEN status WHEN ?='pending' THEN status ELSE ? END, wx_order_id=?, checked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE out_trade_no=?")
      .bind(status, status, result.order.wx_order_id, local.out_trade_no),
    env.DB.prepare("INSERT INTO memberships (openid,product_id,status) SELECT ?,?,'active' WHERE EXISTS (SELECT 1 FROM payment_orders WHERE openid=? AND status='fulfilled') ON CONFLICT(openid) DO UPDATE SET status='active',updated_at=CURRENT_TIMESTAMP")
      .bind(local.openid, PRODUCT.id, local.openid),
    env.DB.prepare("UPDATE memberships SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE openid=? AND NOT EXISTS (SELECT 1 FROM payment_orders WHERE openid=? AND status='fulfilled')")
      .bind(local.openid, local.openid)
  ]);
  const saved = await env.DB.prepare("SELECT status,delivery_ack FROM payment_orders WHERE out_trade_no=?").bind(local.out_trade_no).first();
  if (saved.status === "fulfilled" && !saved.delivery_ack) {
    await call(env, "/xpay/notify_provide_goods", { order_id: local.out_trade_no, env: 0 });
    await env.DB.prepare("UPDATE payment_orders SET delivery_ack=1 WHERE out_trade_no=? AND status='fulfilled'").bind(local.out_trade_no).run();
  }
  return saved.status;
}
export function failure(error) {
  // Do not expose credentials, provider URLs, or database internals to clients.
  return json({ error: error instanceof PaymentError ? error.message : "支付服务暂不可用，请稍后重试" }, error instanceof PaymentError ? error.status : 503);
}
