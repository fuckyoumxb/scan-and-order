// 设置页：填写 Supabase URL / anon key，存 localStorage 并测试连接；并管理收款码。
import { getConfig, connect, uploadPayQr, SiteStore } from "./api.js";

const urlEl = document.getElementById("url");
const keyEl = document.getElementById("key");
const msgEl = document.getElementById("msg");

const saved = getConfig();
urlEl.value = saved.url || "";
keyEl.value = saved.anonKey || "";

function setMsg(text, ok) {
  msgEl.textContent = text;
  msgEl.style.color = ok ? "#07c160" : "#e4393c";
}

async function tryConnect(url, key) {
  const sb = connect(url, key);
  const { error } = await sb.from("menu").select("id").limit(1);
  if (error) throw error;
  return true;
}

document.getElementById("saveBtn").onclick = async () => {
  const url = urlEl.value.trim();
  const key = keyEl.value.trim();
  if (!url || !key) { setMsg("请填写 URL 和 anon key", false); return; }
  setMsg("已保存，正在测试连接…", true);
  try {
    await tryConnect(url, key);
    setMsg("连接成功！即将返回点餐页…", true);
    setTimeout(() => (location.href = "index.html"), 800);
  } catch (e) {
    console.error(e);
    setMsg("已保存，但连接测试失败：" + (e.message || e), false);
  }
};

document.getElementById("testBtn").onclick = async () => {
  const url = urlEl.value.trim();
  const key = keyEl.value.trim();
  if (!url || !key) { setMsg("请先填写 URL 和 anon key", false); return; }
  setMsg("正在测试…", true);
  try {
    await tryConnect(url, key);
    setMsg("连接成功 ✅", true);
  } catch (e) {
    console.error(e);
    setMsg("连接失败：" + (e.message || e), false);
  }
};

// ---------- 收款码 ----------
const payQrFile = document.getElementById("payQrFile");
const payTitleEl = document.getElementById("payTitle");
const payQrPreview = document.getElementById("payQrPreview");
const qrMsgEl = document.getElementById("qrMsg");

function setQrMsg(text, ok) {
  qrMsgEl.textContent = text;
  qrMsgEl.style.color = ok ? "#07c160" : "#e4393c";
}

// 进入设置页时加载已保存的收款码配置
(async () => {
  try {
    const s = await SiteStore.load();
    if (s) {
      if (s.payTitle) payTitleEl.value = s.payTitle;
      if (s.payQr) payQrPreview.innerHTML = `<img src="${s.payQr}" alt="收款码" />`;
    }
  } catch (e) { /* 未配置时静默 */ }
})();

document.getElementById("saveQrBtn").onclick = async () => {
  const file = payQrFile.files[0];
  const title = payTitleEl.value.trim();
  if (!file) { setQrMsg("请先选择收款码图片", false); return; }
  setQrMsg("正在上传…", true);
  try {
    const url = await uploadPayQr(file);
    await SiteStore.save({ payQr: url, payTitle: title });
    payQrPreview.innerHTML = `<img src="${url}" alt="收款码" />`;
    setQrMsg("收款码已保存 ✅ 顾客点餐时即可看到", true);
  } catch (e) {
    console.error(e);
    setQrMsg("保存失败：" + (e.message || e), false);
  }
};
