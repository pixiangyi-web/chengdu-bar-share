# Permanent membership payment

The Pages project now contains `/pay/order`, `/pay/query`, and `/pay/notify`. Apply `migrations/0008_payment_orders.sql` to D1 before using them. The production database was applied directly because its historical migration ledger already contains the columns from migrations 0006 and 0007.

## Required variables

Pages variables/secrets: `WECHAT_OFFER_ID=1450644200`, `WECHAT_APP_KEY`, `WECHAT_APPID`, `WECHAT_APPSECRET`, `WECHAT_NOTIFY_TOKEN`, and `SESSION_SECRET`. Keep `PAYMENT_ENABLED=false` until the payment console, callback URL, and a real test order are ready. Set `MEMBERSHIP_REQUIRED=true` only after that test succeeds.

The message push URL is `https://chengdu-bar-share.pages.dev/pay/notify`. If encrypted message mode is enabled, also add `WECHAT_NOTIFY_AES_KEY` (the 43-character EncodingAESKey). The callback must use the same Token and encryption mode configured in the mini-program console.

当前部署不依赖单独的 Worker。小程序在支付返回、进入会员页时调用 `/pay/query` 补偿查单；因此不需要配置 `PAY_RECONCILE_SECRET`，也不需要在 Cloudflare 中寻找 Worker。

## Release acceptance

1. Confirm the personal主体, 工具类目, certification/filing, virtual payment approval, OfferID, product publication, and iOS mini-program name.
2. Deploy Pages and run the D1 migration. Verify `/api/member` returns `paymentEnabled` without exposing secrets.
3. Use a small real order: login -> `/pay/order` -> `wx.requestVirtualPayment` -> `xpay_goods_deliver_notify` -> `payment_orders.status=fulfilled` -> `memberships.status=active`.
4. Repeat the callback and confirm it does not create another order or entitlement.
5. Confirm a refund marks the order refunded and revokes membership only when no other fulfilled order exists.
6. Keep the membership gate disabled until steps 3-5 pass. Android service fee is 1%; iOS Apple commission is 12%; monthly payment limit for this personal mini-program is 100,000 RMB.
