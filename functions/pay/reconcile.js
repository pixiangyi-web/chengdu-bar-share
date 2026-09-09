import { json, reconcile } from "../../lib/payment.js";

export async function onRequestPost({ request, env }) {
  if (!env.PAY_RECONCILE_SECRET || request.headers.get("authorization") !== `Bearer ${env.PAY_RECONCILE_SECRET}`) return json({ error: "unauthorized" }, 401);
  const { results } = await env.DB.prepare("SELECT * FROM payment_orders WHERE status IN ('pending','fulfilled') ORDER BY COALESCE(checked_at,'1970-01-01') ASC LIMIT 20").all();
  let completed = 0;
  for (const row of results) {
    try { await reconcile(env, row); completed++; }
    catch {
      // Move failures to the back of the queue, without marking them paid.
      await env.DB.prepare("UPDATE payment_orders SET checked_at=CURRENT_TIMESTAMP WHERE out_trade_no=?").bind(row.out_trade_no).run();
    }
  }
  return json({ checked: results.length, completed }, completed === results.length ? 200 : 503);
}
