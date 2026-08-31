// ============================================================
// Supabase 配置
// ------------------------------------------------------------
// 1) FALLBACK_CONFIG（生产配置）：写进上线代码，所有扫码打开的手机都会自动用，
//    无需每台设备单独设置。anon key 是「公开密钥」（受 RLS 行级安全保护，不是秘密），
//    可以放心提交到仓库 / 部署。
//    👉 把下面两行换成你自己的 Supabase 项目值，然后重新部署即可。
// 2) localStorage 覆盖：在 settings.html 另行粘贴的配置优先级更高（用于临时切到别的库 / 测试）。
// ============================================================
const LS_KEY = "scan_order_supabase_config";

// ⚠️ 部署前请填好这两行（从 Supabase 后台 Project Settings → API 复制）：
const FALLBACK_CONFIG = {
  url: "https://czkksaooklatxgriacex.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6a2tzYW9va2xhdHhncmlhY2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODE1NzksImV4cCI6MjEwMzc1NzU3OX0.1y08DpM1XVajZCvV45IBm49XJlVJYt9NPydCuwja9P8"
};

// ⚠️ 兜底收款码：若数据库里没上传收款码（site.pay_qr 为空），顾客端会回退显示这张图。
//    把下方空字符串替换成你的收款码图片 base64（形如 data:image/png;base64,iVBOR...）。
//    这样即使上传功能暂时用不了，顾客也能付钱。留空则按原逻辑提示「未配置收款码」。
const FALLBACK_PAY_QR = "";

export function getConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.url && c.anonKey && c.url.startsWith("http")) return c;
    }
  } catch (e) { /* ignore */ }
  // 兜底：使用代码内写死的生产配置（顾客扫码即用，无需各自设置）
  if (FALLBACK_CONFIG.url && FALLBACK_CONFIG.anonKey && FALLBACK_CONFIG.url.startsWith("http")) {
    return FALLBACK_CONFIG;
  }
  return { url: "", anonKey: "" };
}

export function saveConfig(cfg) {
  localStorage.setItem(LS_KEY, JSON.stringify({
    url: (cfg.url || "").trim(),
    anonKey: (cfg.anonKey || "").trim()
  }));
}

export function hasConfig() {
  const c = getConfig();
  return !!(c && c.url && c.anonKey && c.url.startsWith("http"));
}
