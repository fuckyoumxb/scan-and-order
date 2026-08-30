import { MENU as FALLBACK_MENU, STATUS, STATUS_FLOW } from "./menu.js";
import { OrderStore, MenuStore, createPay, paySuccess } from "./api.js";

const params = new URLSearchParams(location.search);
const table = params.get("table") || "0";
document.getElementById("tableBadge").textContent = "桌号 " + table;
document.getElementById("trackTable").textContent = "桌号 " + table;

let MENU = FALLBACK_MENU;
const cart = {};
let currentOrderId = null;
let addingToOrderId = null;

// ---------- 菜单加载（服务端优先，离线兜底）----------
async function initMenu() {
  const serverMenu = await MenuStore.load();
  MENU = serverMenu && serverMenu.length ? serverMenu : FALLBACK_MENU;
  renderCats();
  renderMenu();
  refreshMenuSteppers();
}
MenuStore.subscribe((m) => {
  if (m && m.length) {
    MENU = m;
    renderCats();
    renderMenu();
    refreshMenuSteppers();
  }
});

// ---------- 渲染 ----------
function renderCats() {
  const el = document.getElementById("cats");
  el.innerHTML = "";
  MENU.forEach((cat, i) => {
    const b = document.createElement("div");
    b.className = "cat" + (i === 0 ? " active" : "");
    b.textContent = cat.category;
    b.onclick = () => {
      document.querySelectorAll(".cat").forEach((c) => c.classList.remove("active"));
      b.classList.add("active");
      document.getElementById("cat-" + i)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    el.appendChild(b);
  });
}

function itemHTML(item) {
  const pic = item.img
    ? `<img class="emoji-img" src="${item.img}" alt="" onerror="this.replaceWith(Object.assign(document.createTextNode('${item.emoji}'),{}))" />`
    : `<div class="emoji">${item.emoji}</div>`;
  return `
    <div class="emoji-wrap">${pic}</div>
    <div class="info">
      <div class="name">${item.name}</div>
      <div class="desc">${item.desc || ""}</div>
      <div class="price"><small>¥</small>${item.price}</div>
    </div>`;
}

function renderMenu() {
  const root = document.getElementById("menu");
  root.innerHTML = "";
  MENU.forEach((cat, i) => {
    const title = document.createElement("div");
    title.className = "section-title";
    title.id = "cat-" + i;
    title.textContent = cat.category;
    root.appendChild(title);
    cat.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = itemHTML(item) + `
        <div class="stepper">
          <button class="minus" hidden>−</button>
          <span class="qty" hidden>0</span>
          <button class="plus">+</button>
        </div>`;
      const minus = row.querySelector(".minus");
      const plus = row.querySelector(".plus");
      const qty = row.querySelector(".qty");
      const sync = () => {
        const n = cart[item.id] ? cart[item.id].qty : 0;
        qty.textContent = n; qty.hidden = n === 0; minus.hidden = n === 0;
      };
      minus.onclick = () => {
        if (!cart[item.id]) cart[item.id] = { item, qty: 0 };
        cart[item.id].qty--; if (cart[item.id].qty <= 0) delete cart[item.id];
        sync(); updateCart();
      };
      plus.onclick = () => {
        if (!cart[item.id]) cart[item.id] = { item, qty: 0 };
        cart[item.id].qty++; sync(); updateCart();
      };
      root.appendChild(row);
    });
  });
}

// ---------- 购物车 ----------
function cartCount() { return Object.values(cart).reduce((s, c) => s + c.qty, 0); }
function cartTotal() { return Object.values(cart).reduce((s, c) => s + c.qty * c.item.price, 0); }

function updateCart() {
  const count = cartCount(), total = cartTotal();
  const badge = document.getElementById("badge");
  badge.textContent = count; badge.classList.toggle("hidden", count === 0);
  document.getElementById("total").innerHTML = count ? `<small>合计</small> ¥${total}` : `未选购<small></small>`;
  document.getElementById("submitBtn").disabled = count === 0;
}

function openDrawer() {
  const list = document.getElementById("cartList");
  list.innerHTML = "";
  const entries = Object.values(cart);
  if (!entries.length) list.innerHTML = '<div class="empty">购物车是空的</div>';
  else entries.forEach(({ item, qty }) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div><div class="n">${item.name}</div><div class="p">¥${item.price} × ${qty}</div></div>
      <div class="stepper"><button class="minus">−</button><span class="qty">${qty}</span><button class="plus">+</button></div>`;
    row.querySelector(".minus").onclick = () => { cart[item.id].qty--; if (cart[item.id].qty <= 0) delete cart[item.id]; openDrawer(); refreshMenuSteppers(); updateCart(); };
    row.querySelector(".plus").onclick = () => { cart[item.id].qty++; openDrawer(); refreshMenuSteppers(); updateCart(); };
    list.appendChild(row);
  });
  document.getElementById("drawerMask").classList.add("open");
  document.getElementById("drawer").classList.add("open");
}
function closeDrawer() {
  document.getElementById("drawerMask").classList.remove("open");
  document.getElementById("drawer").classList.remove("open");
}
function refreshMenuSteppers() {
  document.querySelectorAll(".item").forEach((row) => {
    const name = row.querySelector(".name").textContent;
    const item = MENU.flatMap((c) => c.items).find((it) => it.name === name);
    if (!item) return;
    const n = cart[item.id] ? cart[item.id].qty : 0;
    const qty = row.querySelector(".qty"), minus = row.querySelector(".minus");
    qty.textContent = n; qty.hidden = n === 0; minus.hidden = n === 0;
  });
}

// ---------- 提交 / 加菜 ----------
async function submitOrder() {
  const count = cartCount();
  if (!count) return;
  const items = Object.values(cart).map(({ item, qty }) => ({ id: item.id, name: item.name, price: item.price, qty }));
  const note = document.getElementById("orderNote").value.trim();
  if (addingToOrderId) {
    await OrderStore.update(addingToOrderId, { addItems: items });
    const id = addingToOrderId; addingToOrderId = null;
    resetCart(); showTrack(id);
  } else {
    const order = await OrderStore.add({ table, items, total: cartTotal(), count, note });
    resetCart(); showTrack(order.id);
  }
}
function resetCart() {
  for (const k in cart) delete cart[k];
  document.getElementById("orderNote").value = "";
  updateCart(); refreshMenuSteppers();
}

// ---------- 订单跟踪 ----------
function showTrack(id) {
  currentOrderId = id;
  document.getElementById("orderView").classList.add("hidden");
  document.getElementById("trackView").classList.remove("hidden");
  renderTrack(OrderStore.get(id));
}
function renderTrack(order) {
  if (!order) return;
  document.getElementById("trackNo").textContent = "订单 " + order.id;
  document.getElementById("trackAmount").textContent = `共 ${order.count} 件 · 合计 ¥${order.total}`;
  document.getElementById("paidBadge").classList.toggle("hidden", !order.paid);
  const steps = document.getElementById("trackSteps");
  steps.innerHTML = "";
  const cur = STATUS_FLOW.indexOf(order.status);
  STATUS_FLOW.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "step" + (i <= cur ? " done" : "");
    div.innerHTML = `<div class="dot">${i < cur ? "✓" : i + 1}</div><div class="lbl">${STATUS[s].label}</div>`;
    steps.appendChild(div);
  });
}

// ---------- 催单 / 加菜 / 支付 / 打印 ----------
document.getElementById("urgeBtn").onclick = async (e) => {
  if (!currentOrderId) return;
  await OrderStore.update(currentOrderId, { urge: true });
  e.target.textContent = "已催单 🔔"; e.target.disabled = true;
};
document.getElementById("addBtn").onclick = () => {
  if (!currentOrderId) return;
  addingToOrderId = currentOrderId;
  document.getElementById("trackView").classList.add("hidden");
  document.getElementById("orderView").classList.remove("hidden");
};
document.getElementById("backBtn").onclick = () => {
  document.getElementById("trackView").classList.add("hidden");
  document.getElementById("orderView").classList.remove("hidden");
};

// 支付弹窗
document.getElementById("payBtn").onclick = () => {
  document.getElementById("payInfo").classList.add("hidden");
  document.getElementById("payMask").classList.add("open");
  document.getElementById("payDrawer").classList.add("open");
};
document.getElementById("payClose").onclick = closePay;
document.getElementById("payMask").onclick = closePay;
function closePay() {
  document.getElementById("payMask").classList.remove("open");
  document.getElementById("payDrawer").classList.remove("open");
}
document.querySelectorAll(".pay-method").forEach((btn) => {
  btn.onclick = async () => {
    if (!currentOrderId) return;
    const r = await createPay(currentOrderId, btn.dataset.method);
    document.getElementById("payUrl").textContent = r.payUrl;
    document.getElementById("payQr").textContent = "▦ " + (r.method === "wechat" ? "微信" : "支付宝");
    document.getElementById("payInfo").classList.remove("hidden");
  };
});
document.getElementById("payMock").onclick = async () => {
  if (!currentOrderId) return;
  await paySuccess(currentOrderId);
  closePay();
  renderTrack(OrderStore.get(currentOrderId));
};

// 打印小票
document.getElementById("printBtn").onclick = () => {
  const o = OrderStore.get(currentOrderId);
  if (!o) return;
  const lines = o.items.map((it) => `<div class="r-row"><span>${it.name}</span><span>×${it.qty}</span><span>¥${it.price * it.qty}</span></div>`).join("");
  const el = document.getElementById("receipt");
  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="r-shop">扫码点餐 · 小票</div>
    <div class="r-meta">桌号 ${o.table}　${new Date(o.createdAt).toLocaleString("zh-CN")}</div>
    <div class="r-meta">订单号 ${o.id}</div>
    <hr/>
    ${lines}
    <hr/>
    <div class="r-row r-sum"><span>合计</span><span></span><span>¥${o.total}</span></div>
    <div class="r-meta">支付状态：${o.paid ? "已支付" : "未支付"}</div>
    ${o.note ? `<div class="r-meta">备注：${o.note}</div>` : ""}
    <div class="r-foot">谢谢惠顾 · 请妥善保管</div>`;
  window.print();
  setTimeout(() => el.classList.add("hidden"), 500);
};

// ---------- 事件 ----------
document.getElementById("cartbar").onclick = (e) => {
  if (e.target.id === "submitBtn") { if (cartCount()) openDrawer(); }
  else if (cartCount()) openDrawer();
};
document.getElementById("drawerMask").onclick = closeDrawer;
document.getElementById("clearCart").onclick = () => { resetCart(); openDrawer(); };
document.getElementById("drawerSubmit").onclick = submitOrder;

OrderStore.subscribe((orders) => {
  if (currentOrderId) {
    const o = orders.find((x) => x.id === currentOrderId);
    if (o) renderTrack(o);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

initMenu();
updateCart();
