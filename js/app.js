import { MENU as FALLBACK_MENU, STATUS, STATUS_FLOW } from "./menu.js";
import { OrderStore, MenuStore, createPay, paySuccess, SiteStore } from "./api.js";
import QRCode from "https://esm.sh/qrcode@1.5.3";

// 线上点餐：不再按桌号。下单后订单自动获得「今日第 N 单」序号（由数据库触发器分配）。
let MENU = FALLBACK_MENU;
const cart = {};
let currentOrderId = null;
let addingToOrderId = null;
let SITE = null; // 站点配置（收款码等），所有顾客共享

// 序号格式化为 4 位补零，如 1 -> "0001"
function fmtSeq(seq) {
  return String(seq != null ? seq : 0).padStart(4, "0");
}

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
    const order = await OrderStore.add({ items, total: cartTotal(), count, note });
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
  const o = OrderStore.get(id);
  const paid = o && o.paid;
  document.getElementById("seqBadge").textContent = paid ? "No." + fmtSeq(o.dailySeq) : "待支付";
  document.getElementById("trackSeq").textContent = paid ? "No." + fmtSeq(o.dailySeq) : "待支付";
  document.getElementById("orderView").classList.add("hidden");
  document.getElementById("trackView").classList.remove("hidden");
  renderTrack(o);
}
function renderTrack(order) {
  if (!order) return;
  const paid = !!order.paid;
  const seq = order.dailySeq != null ? order.dailySeq : 0;
  // 顶部序号徽标：仅支付完成后显示单号，否则显示「待支付」
  document.getElementById("seqBadge").textContent = paid ? "No." + fmtSeq(seq) : "待支付";
  document.getElementById("trackSeq").textContent = paid ? "No." + fmtSeq(seq) : "待支付";
  // 醒目大单号（seqHero）：仅支付完成后显示
  const hero = document.getElementById("seqHero");
  if (paid) {
    document.getElementById("seqNum").textContent = fmtSeq(seq);
    hero.classList.remove("hidden");
  } else {
    hero.classList.add("hidden");
  }
  document.getElementById("trackNo").textContent = paid
    ? "支付成功 · 请凭单号取餐"
    : "订单已提交成功 ✓";
  document.getElementById("trackAmount").textContent = `共 ${order.count} 件 · 合计 ¥${order.total}`;
  document.getElementById("paidBadge").classList.toggle("hidden", !paid);
  // 订单明细（确认已点）
  const itemsEl = document.getElementById("trackItems");
  const items = order.items || [];
  if (items.length === 0) {
    itemsEl.innerHTML = '<div class="ti" style="justify-content:center;color:var(--muted);">（暂无菜品明细）</div>';
  } else {
    itemsEl.innerHTML = items.map((it) =>
      `<div class="ti"><span class="n">${it.name} ×${it.qty}</span><span class="p">¥${it.price * it.qty}</span></div>`
    ).join("");
  }
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
document.getElementById("payBtn").onclick = async () => {
  if (!currentOrderId) return;
  document.getElementById("payMask").classList.add("open");
  document.getElementById("payDrawer").classList.add("open");
  const mockBtn = document.getElementById("payMock");
  // 确保站点配置已加载（含店主的收款码）
  if (!SITE) { try { SITE = await SiteStore.load(); } catch (e) { SITE = null; } }
  if (SITE && SITE.payQr) {
    // 自有收款码模式：展示店主收款码，顾客付款后点「我已支付」
    document.getElementById("payDemo").classList.add("hidden");
    const qr = document.getElementById("payQr");
    qr.src = SITE.payQr;
    qr.alt = SITE.payTitle || "收款码";
    qr.onerror = () => {
      qr.removeAttribute("src");
      qr.alt = "收款码加载失败";
      document.getElementById("payTip").textContent = "收款码图片加载失败，请稍后重试";
    };
    document.getElementById("payTip").textContent =
      (SITE.payTitle ? SITE.payTitle + " · " : "") + "请长按或扫一扫上方收款码完成支付";
    mockBtn.textContent = "我已支付 ✓";
    mockBtn.classList.remove("hidden");
    mockBtn.dataset.mode = "qr";
  } else {
    // 未配置收款码：给出清晰提示，而不是去试一个用户没部署的微信支付
    document.getElementById("payDemo").classList.add("hidden");
    mockBtn.classList.add("hidden");
    const qr = document.getElementById("payQr");
    qr.removeAttribute("src");
    qr.alt = "未配置收款码";
    document.getElementById("payTip").textContent = "店家尚未上传收款码，请联系店家配置后再支付";
  }
};
document.getElementById("payClose").onclick = closePay;
document.getElementById("payMask").onclick = closePay;
function closePay() {
  document.getElementById("payMask").classList.remove("open");
  document.getElementById("payDrawer").classList.remove("open");
}
document.getElementById("payMock").onclick = async () => {
  if (!currentOrderId) return;
  // 自有收款码模式与演示模式，均由顾客确认/模拟后置 paid=true，触发取单号显示
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
    <div class="r-shop">线上点餐 · 小票</div>
    <div class="r-meta">取单号 No.${fmtSeq(o.dailySeq)}　${new Date(o.createdAt).toLocaleString("zh-CN")}</div>
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
    if (o) {
      renderTrack(o);
      // 真实支付回调置 paid 后，自动关闭支付弹窗
      if (o.paid && document.getElementById("payDrawer").classList.contains("open")) closePay();
    }
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

async function initSite() {
  try { SITE = await SiteStore.load(); } catch (e) { SITE = null; }
}

initMenu();
initSite();
updateCart();
