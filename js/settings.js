// 设置页：填写 Supabase URL / anon key，存 localStorage 并测试连接。
import { getConfig, connect } from "./api.js";

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
