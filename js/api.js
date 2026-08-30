// ============================================================
// 数据层：Supabase（Postgres + Realtime）。
// 配置由「设置页(settings.html)」填写并存于浏览器 localStorage（见 config.js），
// 因此无需把密钥写进代码，也无需告诉任何人。
// 对外暴露 OrderStore / MenuStore / createPay / paySuccess / connect / ensureClient。
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getConfig, saveConfig } from "./config.js";

let supabase = null;

// 懒初始化：首次需要时从 localStorage 读取用户自行填写的配置
export function ensureClient() {
  if (supabase) return supabase;
  const c = getConfig();
  if (c && c.url && c.anonKey && c.url.startsWith("http")) {
    try { supabase = createClient(c.url, c.anonKey); }
    catch (e) { console.error("Supabase 初始化失败", e); supabase = null; }
  }
  return supabase;
}

// 设置页调用：保存并（重）连接
export function connect(url, anonKey) {
  saveConfig({ url, anonKey });
  if (supabase) { try { supabase.removeAllChannels(); } catch (e) {} }
  supabase = createClient(url, anonKey);
  return supabase;
}

export function isConfigured() { return !!ensureClient(); }

let orderCache = [];
let menuCache = [];
const orderListeners = new Set();
const menuListeners = new Set();
let ordersSub = null;
let menuSub = null;

function notifyOrders() { orderListeners.forEach((cb) => cb(orderCache)); }
function notifyMenu() { menuListeners.forEach((cb) => cb(menuCache)); }

function showConfigHint() {
  if (document.getElementById("cfgHint")) return;
  if (!document.body) return;
  const b = document.createElement("div");
  b.id = "cfgHint";
  b.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:9999;background:#ff6b35;color:#fff;" +
    "padding:10px 14px;font-size:13px;text-align:center;line-height:1.4;";
  b.innerHTML =
    '⚠️ 未配置 Supabase：<a href="settings.html" style="color:#fff;text-decoration:underline;">点此前往设置</a>' +
    '（密钥仅存本机浏览器，安全）';
  document.body.appendChild(b);
}

// Supabase 返回 snake_case 字段，前端统一用 camelCase
function mapOrder(o) {
  if (!o) return o;
  return Object.assign({}, o, {
    createdAt: o.created_at || o.createdAt,
    dailySeq: o.daily_seq != null ? o.daily_seq : o.dailySeq
  });
}

// ---------------------- 订单 ----------------------
async function loadOrders() {
  ensureClient();
  if (!supabase) { showConfigHint(); return orderCache; }
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) { console.error("加载订单失败", error); return orderCache; }
  orderCache = (data || []).map(mapOrder);
  notifyOrders();
  return orderCache;
}

function mergeItems(items, addItems) {
  const map = new Map();
  (items || []).forEach((it) => map.set(it.id, { ...it }));
  addItems.forEach((it) => {
    const ex = map.get(it.id);
    if (ex) ex.qty += it.qty;
    else map.set(it.id, { ...it });
  });
  return [...map.values()];
}

export const OrderStore = {
  list() { return orderCache; },
  get(id) { return orderCache.find((o) => o.id === id) || null; },
  async add(order) {
    ensureClient();
    if (!supabase) throw new Error("Supabase 未配置");
    // 线上点餐：不传桌号，daily_seq 由数据库触发器按天自增分配
    const row = {
      items: order.items || [],
      total: order.total || 0,
      count: order.count || 0,
      note: order.note || "",
      status: "pending",
      urge: false,
      paid: false
    };
    const { data, error } = await supabase.from("orders").insert(row).select().single();
    if (error) throw error;
    await loadOrders();
    return mapOrder(data); // 含 daily_seq
  },
  async update(id, patch) {
    ensureClient();
    if (!supabase) throw new Error("Supabase 未配置");
    const set = {};
    if (patch.status) set.status = patch.status;
    if (patch.urge) set.urge = true;
    if (patch.note !== undefined) set.note = patch.note;
    if (patch.paid !== undefined) set.paid = patch.paid;
    if (patch.addItems) {
      const cur = this.get(id) || (await loadOrders(), this.get(id));
      const items = mergeItems(cur ? cur.items : [], patch.addItems);
      set.items = items;
      set.count = items.reduce((s, i) => s + i.qty, 0);
      set.total = items.reduce((s, i) => s + i.qty * i.price, 0);
    }
    const { error } = await supabase.from("orders").update(set).eq("id", id);
    if (error) throw error;
    await loadOrders();
    return this.get(id);
  },
  async clearDone() {
    ensureClient();
    if (!supabase) return;
    const done = orderCache.filter((o) => o.status === "done");
    for (const o of done) {
      await supabase.from("orders").delete().eq("id", o.id).catch(() => {});
    }
    await loadOrders();
  },
  subscribe(cb) {
    orderListeners.add(cb);
    ensureClient();
    ensureOrdersSub();
    if (!orderCache.length) loadOrders();
    return () => orderListeners.delete(cb);
  }
};

function ensureOrdersSub() {
  ensureClient();
  if (!supabase || ordersSub) return;
  ordersSub = supabase
    .channel("orders-room")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadOrders())
    .subscribe();
}

// ---------------------- 菜单 ----------------------
async function loadMenu() {
  ensureClient();
  if (!supabase) { showConfigHint(); return menuCache; }
  const { data, error } = await supabase.from("menu").select("data, updated_at").eq("id", 1).single();
  if (error && error.code !== "PGRST116") { console.error("加载菜单失败", error); return menuCache; }
  menuCache = data && Array.isArray(data.data) ? data.data : [];
  notifyMenu();
  return menuCache;
}

export const MenuStore = {
  list() { return menuCache; },
  async load() { return loadMenu(); },
  async save(menu) {
    ensureClient();
    if (!supabase) throw new Error("Supabase 未配置");
    const { error } = await supabase
      .from("menu")
      .upsert({ id: 1, data: menu, updated_at: new Date().toISOString() });
    if (error) throw error;
    menuCache = menu;
    notifyMenu();
    return menu;
  },
  subscribe(cb) {
    menuListeners.add(cb);
    ensureClient();
    ensureMenuSub();
    if (!menuCache.length) loadMenu();
    return () => menuListeners.delete(cb);
  }
};

function ensureMenuSub() {
  ensureClient();
  if (!supabase || menuSub) return;
  menuSub = supabase
    .channel("menu-room")
    .on("postgres_changes", { event: "*", schema: "public", table: "menu" }, () => loadMenu())
    .subscribe();
}

// ---------------------- 菜品图片上传（Supabase Storage）----------------------
export async function uploadImage(file) {
  ensureClient();
  if (!supabase) throw new Error("Supabase 未配置");
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = "dishes/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const { error } = await supabase.storage
    .from("dish-images")
    .upload(path, file, { upsert: false, contentType: file.type || "image/png" });
  if (error) throw error;
  const { data } = supabase.storage.from("dish-images").getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------- 支付（微信 Native 扫码付）----------------------
// 调用 Supabase Edge Function `wechat-pay` 创建 Native 订单，返回 { code_url }；
// 未部署 / 未配置密钥时返回 { demo:true }，前端降级为「模拟支付成功」。
// 真实支付结果由微信异步回调（Edge Function /notify）解密后置 paid=true。
export async function createPay(orderId) {
  const o = OrderStore.get(orderId);
  if (!o) throw new Error("订单不存在");
  ensureClient();
  if (!supabase) return { demo: true };
  try {
    const { data, error } = await supabase.functions.invoke("wechat-pay", {
      body: {
        action: "create",
        orderId: o.id,
        totalFen: Math.round((o.total || 0) * 100)
      }
    });
    if (error) return { demo: true };
    return data && data.code_url ? data : { demo: true };
  } catch (e) {
    console.warn("调用微信支付失败，降级演示模式", e);
    return { demo: true };
  }
}
export async function paySuccess(orderId) {
  return OrderStore.update(orderId, { paid: true });
}
