// 订单存储：localStorage + BroadcastChannel 实现跨标签页/跨端实时同步。
// 说明：这是纯前端原型。生产环境应替换为后端 API（WebSocket / 轮询）。
const STORE_KEY = "scan_order_orders_v1";
const CHANNEL = "scan_order_channel";

const channel = ("BroadcastChannel" in window) ? new BroadcastChannel(CHANNEL) : null;

function readOrders() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function writeOrders(orders) {
  localStorage.setItem(STORE_KEY, JSON.stringify(orders));
  if (channel) channel.postMessage({ type: "orders", orders });
  // 同标签页内通知
  window.dispatchEvent(new CustomEvent("orders-updated"));
}

export const OrderStore = {
  list() {
    return readOrders();
  },
  get(id) {
    return readOrders().find((o) => o.id === id) || null;
  },
  add(order) {
    const all = readOrders();
    all.unshift(order);
    writeOrders(all);
    return order;
  },
  update(id, patch) {
    const all = readOrders();
    const i = all.findIndex((o) => o.id === id);
    if (i >= 0) {
      all[i] = { ...all[i], ...patch, updatedAt: Date.now() };
      writeOrders(all);
    }
  },
  remove(id) {
    writeOrders(readOrders().filter((o) => o.id !== id));
  },
  clearDone() {
    writeOrders(readOrders().filter((o) => o.status !== "done"));
  },
  // 订阅变更：BroadcastChannel / storage 事件 / 同标签页事件
  subscribe(cb) {
    const onLocal = () => cb(readOrders());
    const onStorage = (e) => {
      if (e.key === STORE_KEY) cb(readOrders());
    };
    window.addEventListener("orders-updated", onLocal);
    window.addEventListener("storage", onStorage);
    if (channel) {
      channel.onmessage = (e) => {
        if (e.data && e.data.type === "orders") cb(e.data.orders);
      };
    }
    return () => {
      window.removeEventListener("orders-updated", onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }
};

export function newOrderId() {
  return "ORD" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000);
}
