import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createDecipheriv } from "node:crypto";
import { PaymentError } from "./payment.js";

export async function messageSignature(parts) {
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode([...parts].sort().join("")));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function parseMessage(text) {
  if (text.length > 65536) throw new PaymentError("消息过大", 413);
  if (text.trim().startsWith("{")) return JSON.parse(text);
  if (text.toUpperCase().includes("<!DOCTYPE") || XMLValidator.validate(text) !== true) throw new PaymentError("无效消息", 400);
  return new XMLParser({ parseTagValue: false, processEntities: false }).parse(text).xml;
}
export async function verifyMessage(params, env, encrypted = "") {
  if (!env.WECHAT_NOTIFY_TOKEN) throw new PaymentError("消息推送 Token 未配置");
  const timestamp = params.get("timestamp");
  const nonce = params.get("nonce");
  if (!timestamp || !nonce) throw new PaymentError("无效签名", 403);
  const expected = await messageSignature([env.WECHAT_NOTIFY_TOKEN, timestamp, nonce, ...(encrypted ? [encrypted] : [])]);
  if (!equal(expected, params.get(encrypted ? "msg_signature" : "signature"))) throw new PaymentError("无效签名", 403);
}
export function decryptRaw(encrypted, env) {
  if (!env.WECHAT_NOTIFY_AES_KEY || env.WECHAT_NOTIFY_AES_KEY.length !== 43) throw new PaymentError("消息推送 EncodingAESKey 未配置");
  const key = Buffer.from(env.WECHAT_NOTIFY_AES_KEY + "=", "base64");
  const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16));
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]);
  const padding = plain[plain.length - 1];
  if (!padding || padding > 32 || !plain.subarray(-padding).every(byte => byte === padding)) throw new PaymentError("消息解密失败", 403);
  const unpadded = plain.subarray(0, -padding);
  if (unpadded.length < 20) throw new PaymentError("消息解密失败", 403);
  const length = unpadded.readUInt32BE(16);
  const appid = unpadded.subarray(20 + length).toString("utf8");
  if (appid !== (env.WECHAT_APPID || "wxc634ef27c14ed031")) throw new PaymentError("消息接收方不符", 403);
  return unpadded.subarray(20, 20 + length).toString("utf8");
}
export function decryptMessage(encrypted, env) {
  return parseMessage(decryptRaw(encrypted, env));
}
