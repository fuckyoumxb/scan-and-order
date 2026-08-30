// ============================================================
// 微信支付（Native 扫码付）· Supabase Edge Function (Deno)
// ------------------------------------------------------------
// 部署：
//   supabase functions deploy wechat-pay
// 配置密钥（Supabase 控制台 → Project Settings → Edge Functions → Secrets，
// 或命令行：supabase secrets set WECHAT_APPID=xxx ...）：
//   WECHAT_APPID       微信 AppID（需与商户绑定，Native 付用公众号/小程序/App 的 appid）
//   WECHAT_MCHID       微信支付商户号
//   WECHAT_APIV3_KEY   APIv3 密钥（32 字节）
//   WECHAT_SERIAL_NO   商户 API 证书序列号
//   WECHAT_PRIVATE_KEY 商户 API 私钥（PEM：-----BEGIN PRIVATE KEY----- ...）
//   （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自动注入）
//
// 路由：
//   POST ?action=create   前端调用：创建 Native 订单，返回 { code_url }
//   POST ?action=notify    微信异步回调：解密 resource，把订单 paid 置 true
// 未配置密钥时返回 { demo:true }，前端降级为「模拟支付成功」。
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  return b64ToBytes(b64);
}
function nonceStr(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 生成微信支付 v3 请求签名（RSA-SHA256）
async function sign(
  method: string,
  path: string,
  body: string,
  mchid: string,
  serial: string,
  keyPem: string
): Promise<string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = nonceStr();
  const msg = `${method}\n${path}\n${ts}\n${nonce}\n${body}\n`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(keyPem),
    { name: "RSASSA-PKCS1-V1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-V1_5",
    key,
    new TextEncoder().encode(msg)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${ts}",serial_no="${serial}"`;
}

// 解密微信回调中的 resource（AES-256-GCM，密钥为 APIv3 key）
async function decryptResource(resource: any, apiv3: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiv3),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const nonce = b64ToBytes(resource.nonce);
  const ad = new TextEncoder().encode(resource.associated_data || "");
  const ct = b64ToBytes(resource.ciphertext);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, additionalData: ad },
    key,
    ct
  );
  return new TextDecoder().decode(plain);
}

async function createNative(
  orderId: string,
  table: string,
  totalFen: number,
  notifyUrl: string
): Promise<Response> {
  const appid = Deno.env.get("WECHAT_APPID");
  const mchid = Deno.env.get("WECHAT_MCHID");
  const apiv3 = Deno.env.get("WECHAT_APIV3_KEY");
  const serial = Deno.env.get("WECHAT_SERIAL_NO");
  const keyPem = Deno.env.get("WECHAT_PRIVATE_KEY");

  if (!appid || !mchid || !apiv3 || !serial || !keyPem) {
    return json({ demo: true, reason: "微信支付未配置（缺少 Supabase Secrets）" });
  }

  const body = JSON.stringify({
    appid,
    mchid,
    description: `扫码点餐-桌号${table}`,
    out_trade_no: orderId,
    notify_url: notifyUrl,
    amount: { total: totalFen, currency: "CNY" },
  });

  const auth = await sign("POST", "/v3/pay/transactions/native", body, mchid, serial, keyPem);
  const resp = await fetch("https://api.mch.weixin.qq.com/v3/pay/transactions/native", {
    method: "POST",
    headers: {
      Authorization: `WECHATPAY2-SHA256-RSA2048 ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "scan-order-pwa/1.0",
    },
    body,
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error("微信下单失败", data);
    return json({ demo: true, reason: "微信下单失败", detail: data }, 200);
  }
  return json({ code_url: data.code_url });
}

async function handleNotify(req: Request): Promise<Response> {
  const apiv3 = Deno.env.get("WECHAT_APIV3_KEY");
  try {
    const payload = await req.json();
    const resource = payload?.resource;
    if (resource && apiv3) {
      const plain = await decryptResource(resource, apiv3);
      const tx = JSON.parse(plain);
      if (tx.trade_state === "SUCCESS") {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const { error } = await sb
          .from("orders")
          .update({ paid: true })
          .eq("id", tx.out_trade_no);
        if (error) console.error("更新订单失败", error);
      }
    }
  } catch (e) {
    console.error("notify 处理异常", e);
  }
  // 无论成功与否都返回 SUCCESS，避免微信重复推送
  return json({ code: "SUCCESS", message: "成功" });
}

function json(obj: any, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "notify") return handleNotify(req);

  const body = await req.json().catch(() => ({}));
  if (body.action === "create" || action === "create") {
    const base = Deno.env.get("SUPABASE_URL") || url.origin;
    const notifyUrl = `${base}/functions/v1/wechat-pay?action=notify`;
    return createNative(body.orderId, body.table, body.totalFen, notifyUrl);
  }
  return json({ error: "unknown action" }, 400);
}
