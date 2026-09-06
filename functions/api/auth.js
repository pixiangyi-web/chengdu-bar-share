const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

const encode = (value) => btoa(String.fromCharCode(...new TextEncoder().encode(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encodeBytes = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encodeBytes(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const code = String(body.code || "").trim();
  if (!code || !env.WECHAT_APPSECRET) return json({ error: "微信登录服务未配置" }, 503);
  const appid = env.WECHAT_APPID || "wxc634ef27c14ed031";
  const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(env.WECHAT_APPSECRET)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`);
  const result = await response.json();
  if (!result.openid) return json({ error: "微信身份校验失败" }, 401);
  const payload = encode(JSON.stringify({ openid: result.openid, exp: Math.floor(Date.now() / 1000) + 21600 }));
  const secret = env.SESSION_SECRET || env.WECHAT_APPSECRET;
  return json({ token: `${payload}.${await sign(payload, secret)}` });
}
