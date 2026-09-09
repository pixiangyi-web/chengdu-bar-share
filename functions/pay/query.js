import { failure, identity, json, member, reconcile } from "../../lib/payment.js";

export async function onRequestPost({ request, env }) {
  try {
    const openid = await identity(request, env);
    if (!openid) return json({ error: "unauthorized" }, 401);
    const { orderId } = await request.json();
    const rows = orderId
      ? { results: [await env.DB.prepare("SELECT * FROM payment_orders WHERE out_trade_no=? AND openid=?").bind(String(orderId), openid).first()].filter(Boolean) }
      : await env.DB.prepare("SELECT * FROM payment_orders WHERE openid=? AND status IN ('pending','fulfilled') ORDER BY created_at DESC LIMIT 5").bind(openid).all();
    if (orderId && !rows.results.length) return json({ error: "订单不存在" }, 404);
    const orders = [];
    for (const row of rows.results) orders.push({ orderId: row.out_trade_no, status: await reconcile(env, row) });
    return json({ member: await member(env, openid), orders });
  } catch (error) { return failure(error); }
}
