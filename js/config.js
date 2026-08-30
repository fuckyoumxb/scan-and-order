// ============================================================
// Supabase 配置 —— 改为「应用内设置页」填写，保存在浏览器 localStorage。
// 这样你无需把密钥写进代码、也无需告诉任何人：打开 settings.html 自行粘贴即可。
// 取值函数由 api.js 调用；如需手动改默认值，可在此修改占位。
// ============================================================
const LS_KEY = "scan_order_supabase_config";

export function getConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
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
