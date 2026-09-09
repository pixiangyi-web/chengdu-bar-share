import { failure, PaymentError, PRODUCT, reconcile } from "../../lib/payment.js";
import { decryptMessage, parseMessage, verifyMessage } from "../../lib/payment-notify.js";

export async function onRequestGet({ request, env }) {
  try {
    const params = new URL(request.url).searchParams;
    await verifyMessage(params, env);
    return new Response(params.get("echostr") || "", { headers: { "content-type": "text/plain" } });
  } catch (error) { return failure(error); }
}
export async function onRequestPost({ request, env }) {
  try {
    if (Number(request.headers.get("content-length")) > 65536) throw new PaymentError("消息过大", 413);
    let message = parseMessage(await request.text());
    const encrypted = message?.Encrypt || message?.encrypt;
    await verifyMessage(new URL(request.url).searchParams, env, encrypted);
    if (encrypted) message = decryptMessage(encrypted, env);
    const event = message?.Event;
    if (!["xpay_goods_deliver_notify", "xpay_refund_notify"].includes(event)) return new Response("success");
    const orderId = event === "xpay_refund_notify" ? message.MchOrderId : message.OutTradeNo;
    const row = await env.DB.prepare("SELECT * FROM payment_orders WHERE out_trade_no=?").bind(String(orderId || "")).first();
    if (!row || row.openid !== message.OpenId) throw new PaymentError("订单身份不符", 409);
    if (event === "xpay_goods_deliver_notify") {
      const goods = message.GoodsInfo;
      if (Number(message.Env) !== 0 || goods?.ProductId !== PRODUCT.id || Number(goods.Quantity) !== 1 || Number(goods.OrigPrice) !== PRODUCT.price || goods.Attach !== row.out_trade_no) throw new PaymentError("订单商品不符", 409);
    }
    // Query WeChat even for signed plaintext notifications: the URL signature
    // alone does not authenticate the body. Never trust a claimed payment status.
    const status = await reconcile(env, row);
    if (event === "xpay_goods_deliver_notify" && !["fulfilled", "refunded"].includes(status)) throw new PaymentError("订单尚未确认支付");
    if (event === "xpay_refund_notify" && Number(message.RetCode) === 0 && status !== "refunded") throw new PaymentError("退款状态尚未同步");
    return request.headers.get("content-type")?.includes("json")
      ? Response.json({ ErrCode: 0, ErrMsg: "success" })
      : new Response("<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>", { headers: { "content-type": "application/xml; charset=utf-8" } });
  } catch (error) { return failure(error); }
}
