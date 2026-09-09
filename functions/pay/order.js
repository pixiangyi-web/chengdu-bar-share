import { PRODUCT, PaymentError, configured, failure, identity, json, loginForPayment, member, payData } from "../../lib/payment.js";

export async function onRequestPost({ request, env }) {
  try {
    const openid = await identity(request, env);
    if (!openid) return json({ error: "unauthorized" }, 401);
    if (!configured(env) || env.PAYMENT_ENABLED !== "true") throw new PaymentError("支付尚未开放");
    if (await member(env, openid)) return json({ member: true });
    const body = await request.json();
    if (typeof body.code !== "string" || !body.code || body.code.length > 256) return json({ error: "需要重新微信登录" }, 400);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM payment_orders WHERE openid=? AND created_at > datetime('now','-1 hour')").bind(openid).first();
    if (recent.count >= 10) throw new PaymentError("下单过于频繁，请稍后再试", 429);
    const sessionKey = await loginForPayment(env, body.code, openid);
    const orderId = `M${crypto.randomUUID().replace(/-/g, "").slice(0, 31)}`;
    await env.DB.prepare("INSERT INTO payment_orders (out_trade_no,openid,product_id,amount) VALUES (?,?,?,?)").bind(orderId, openid, PRODUCT.id, PRODUCT.price).run();
    return json({ orderId, payData: await payData(env, sessionKey, orderId) });
  } catch (error) { return failure(error); }
}
