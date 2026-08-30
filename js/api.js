// ============================================================
// 数据层：Supabase（Postgres + Realtime）。替换原本地 REST/WebSocket 实现。
// 对外暴露 OrderStore / MenuStore / createPay / paySuccess，接口与旧版保持一致，
// 因此 index.html / kitchen.html / admin.html 无需改动调用方式。
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith("http"));

let supabase = null;
if (configured) {
  try { supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
  catch (e) { console.error("Supabase 初始化失败", e); supabase = null; }
}
if (!configured) showConfigHint();

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
  const b = document.createElement("div");
  b.id = "cfgHint";
  b.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:9999;background:#ff6b35;color:#fff;" +
    "padding:10px 14px;font-size:13px;text-align:center;line-height:1.4;";
  b.textContent =
    "⚠️ 未配置 Supabase：请在 js/config.js 填入 SUPABASE_URL 与 SUPABASE_ANON_KEY，否则无法云端同步（菜单将使用本地兜底数据）。";
  document.body.appendChild(b);
}

// Supabase 返回 created_at(snake_case)，前端统一用 createdAt
function mapOrder(o) {
  if (!o) return o;
  return Object.assign({}, o, { createdAt: o.created_at || o.createdAt });
}

// ---------------------- 订单 ----------------------
async function loadOrders() {
  if (!supabase) return orderCache;
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
    if (!supabase) throw new Error("Supabase 未配置");
    const row = {
      table: order.table || "0",
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
    return mapOrder(data);
  },
  async update(id, patch) {
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
    if (!supabase) return;
    const done = orderCache.filter((o) => o.status === "done");
    for (const o of done) {
      await supabase.from("orders").delete().eq("id", o.id).catch(() => {});
    }
    await loadOrders();
  },
  subscribe(cb) {
    orderListeners.add(cb);
    ensureOrdersSub();
    if (!orderCache.length) loadOrders();
    return () => orderListeners.delete(cb);
  }
};

function ensureOrdersSub() {
  if (!supabase || ordersSub) return;
  ordersSub = supabase
    .channel("orders-room")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadOrders())
    .subscribe();
}

// ---------------------- 菜单 ----------------------
async function loadMenu() {
  if (!supabase) return menuCache;
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
    ensureMenuSub();
    if (!menuCache.length) loadMenu();
    return () => menuListeners.delete(cb);
  }
};

function ensureMenuSub() {
  if (!supabase || menuSub) return;
  menuSub = supabase
    .channel("menu-room")
    .on("postgres_changes", { event: "*", schema: "public", table: "menu" }, () => loadMenu())
    .subscribe();
}

// ---------------------- 支付（演示，无真实商户号）----------------------
// 接入真实微信/支付宝时：在后端用 supabase 的 service_role 调用统一下单，
// 前端用 createPay 拿到 payUrl 展示二维码，支付回调里把对应订单 paid 置 true。
export async function createPay(orderId, method) {
  return { orderId, method, payUrl: "demo://pay/" + method + "/" + orderId };
}
export async function paySuccess(orderId) {
  return OrderStore.update(orderId, { paid: true });
}
