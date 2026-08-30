import { STATUS, STATUS_FLOW } from "./menu.js";
import { OrderStore } from "./api.js";

const activeEl = document.getElementById("colActive");
const doneEl = document.getElementById("colDone");
const emptyTip = document.getElementById("emptyTip");

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function orderCard(o) {
  const curIdx = STATUS_FLOW.indexOf(o.status);
  const next = STATUS_FLOW[curIdx + 1];
  const lines = o.items
    .map((it) => `<div class="line"><span>${it.name}</span><span>×${it.qty}</span></div>`)
    .join("");
  const urge = o.urge ? `<span class="urge">⚡催单</span>` : "";
  const paid = o.paid ? `<span class="paid">已付</span>` : `<span class="unpaid">未付</span>`;
  const note = o.note ? `<div class="knote">📝 ${o.note}</div>` : "";
  const card = document.createElement("div");
  card.className = "order" + (o.urge ? " urge-order" : "");
  card.style.borderLeftColor = STATUS[o.status].color;
  card.innerHTML = `
    <div class="meta">
      <span class="tbl">今日第 ${o.dailySeq != null ? o.dailySeq : "?"} 单 ${urge}</span>
      <span>${fmtTime(o.createdAt)} · ${o.id} ${paid}</span>
    </div>
    ${lines}
    ${note}
    <div class="sum">合计 ¥${o.total} · ${STATUS[o.status].label}</div>
    ${
      next
        ? `<button class="next" data-id="${o.id}" data-next="${next}">标记为「${STATUS[next].label}」</button>`
        : `<button class="next done" disabled>已完成 🎉</button>`
    }
    <button class="next print" data-id="${o.id}">🖨️ 小票</button>`;
  const btn = card.querySelector(".next:not(.print)");
  if (next) btn.onclick = () => OrderStore.update(o.id, { status: next });
  card.querySelector(".print").onclick = () => printReceipt(o);
  return card;
}

function printReceipt(o) {
  const lines = o.items.map((it) => `<div class="r-row"><span>${it.name}</span><span>×${it.qty}</span><span>¥${it.price * it.qty}</span></div>`).join("");
  let el = document.getElementById("receipt");
  if (!el) {
    el = document.createElement("div");
    el.id = "receipt";
    document.body.appendChild(el);
  }
  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="r-shop">线上点餐 · 后厨小票</div>
    <div class="r-meta">今日第 ${o.dailySeq != null ? o.dailySeq : "?"} 单　${new Date(o.createdAt).toLocaleString("zh-CN")}</div>
    <div class="r-meta">订单号 ${o.id}</div>
    <hr/>
    ${lines}
    <hr/>
    <div class="r-row r-sum"><span>合计</span><span></span><span>¥${o.total}</span></div>
    <div class="r-meta">状态：${STATUS[o.status].label}　${o.paid ? "已支付" : "未支付"}</div>
    ${o.note ? `<div class="r-meta">备注：${o.note}</div>` : ""}
    <div class="r-foot">请按单制作</div>`;
  window.print();
  setTimeout(() => el.classList.add("hidden"), 600);
}

function render(orders) {
  activeEl.innerHTML = "";
  doneEl.innerHTML = "";
  const active = orders.filter((o) => o.status !== "ready" && o.status !== "done");
  const finished = orders.filter((o) => o.status === "ready" || o.status === "done");
  active.forEach((o) => activeEl.appendChild(orderCard(o)));
  finished.forEach((o) => doneEl.appendChild(orderCard(o)));
  emptyTip.classList.toggle("hidden", orders.length > 0);
}

document.getElementById("clearDone").onclick = async () => {
  if (!confirm("确认清理所有已完成订单？")) return;
  const done = OrderStore.list().filter((o) => o.status === "done");
  for (const o of done) await OrderStore.update(o.id, { status: "done" }).catch(() => {});
  // 服务端保留数据；此处仅作前端清空示意。真实环境应由服务端软删除。
  location.reload();
};

OrderStore.subscribe(render);
render(OrderStore.list());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
