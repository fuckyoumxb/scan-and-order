// 扫码点餐 PWA —— 后端服务（仅用 Node 内置模块，零依赖）
// 功能：静态资源 + REST API + 极简 WebSocket 实时推送 + JSON 文件持久化
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4173;
const ROOT = path.join(__dirname, ".."); // 项目根（scan-order-pwa）
const DATA = path.join(__dirname, "data");
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

// 防止单个异常（如客户端异常帧）拖垮整个服务
process.on("uncaughtException", (e) => console.error("[uncaught]", e && e.message));
process.on("unhandledRejection", (e) => console.error("[unhandled]", e && e.message));

const MENU_FILE = path.join(DATA, "menu.json");
const ORDERS_FILE = path.join(DATA, "orders.json");

// ---------- 默认菜单（首次运行写入 menu.json）----------
const DEFAULT_MENU = [
  { category: "招牌热菜", items: [
    { id: "h1", name: "红烧肉", desc: "肥而不腻 入口即化", price: 38, emoji: "🍖", img: "" },
    { id: "h2", name: "宫保鸡丁", desc: "微辣 花生脆爽", price: 28, emoji: "🍗", img: "" },
    { id: "h3", name: "麻婆豆腐", desc: "麻辣鲜香", price: 22, emoji: "🌶️", img: "" }
  ]},
  { category: "主食", items: [
    { id: "s1", name: "米饭", desc: "东北珍珠米", price: 3, emoji: "🍚", img: "" },
    { id: "s2", name: "牛肉面", desc: "手工拉面", price: 18, emoji: "🍜", img: "" }
  ]},
  { category: "饮品", items: [
    { id: "d1", name: "可乐", desc: "冰镇 330ml", price: 6, emoji: "🥤", img: "" },
    { id: "d2", name: "鲜榨橙汁", desc: "无添加", price: 12, emoji: "🍊", img: "" }
  ]},
  { category: "甜点", items: [
    { id: "c1", name: "提拉米苏", desc: "经典意式", price: 16, emoji: "🍰", img: "" }
  ]}
];

function loadMenu() {
  try { return JSON.parse(fs.readFileSync(MENU_FILE, "utf8")); }
  catch (e) { fs.writeFileSync(MENU_FILE, JSON.stringify(DEFAULT_MENU, null, 2)); return DEFAULT_MENU; }
}
function saveMenu(m) { fs.writeFileSync(MENU_FILE, JSON.stringify(m, null, 2)); }
function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); }
  catch (e) { fs.writeFileSync(ORDERS_FILE, "[]"); return []; }
}
function saveOrders(o) { fs.writeFileSync(ORDERS_FILE, JSON.stringify(o, null, 2)); }

let MENU = loadMenu();
let ORDERS = loadOrders();

// ---------- WebSocket ----------
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const clients = new Set();

function safeWrite(socket, frame) {
  try { if (socket && !socket.destroyed && socket.readyState === "open") socket.write(frame); }
  catch (_) { try { socket.destroy(); } catch (_) {} }
}
function broadcast(obj) {
  const frame = encodeFrame(JSON.stringify(obj));
  for (const c of clients) safeWrite(c, frame);
}
function wsSend(socket, obj) { safeWrite(socket, encodeFrame(JSON.stringify(obj))); }

function encodeFrame(str) {
  const payload = Buffer.from(str, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function handleWsUpgrade(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );
  socket._buf = Buffer.alloc(0);
  clients.add(socket);

  // 初始下发
  wsSend(socket, { type: "init", orders: ORDERS, menu: MENU });

  socket.on("data", (chunk) => {
    socket._buf = Buffer.concat([socket._buf, chunk]);
    try { parseFrames(socket); } catch (e) { console.error("[ws parse]", e.message); }
  });
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
}

function parseFrames(socket) {
  let buf = socket._buf;
  while (buf.length >= 2) {
    const b1 = buf[1];
    const masked = (b1 & 0x80) === 0x80;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) return;
      len = buf.readUInt16BE(2); offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) return;
      len = Number(buf.readBigUInt64BE(2)); offset = 10;
    }
    let maskKey = null;
    if (masked) {
      if (buf.length < offset + 4) return;
      maskKey = buf.slice(offset, offset + 4); offset += 4;
    }
    if (buf.length < offset + len) return; // 帧未完整
    const payload = Buffer.from(buf.slice(offset, offset + len));
    if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];

    const opcode = buf[0] & 0x0f;
    if (opcode === 0x8) { socket.end(); return; } // close
    if (opcode === 0x9) { // ping -> pong
      socket.write(Buffer.concat([Buffer.from([0x8a, len]), payload]));
    }
    // 0x1 text：客户端消息（本应用客户端只收不发指令，忽略内容）

    buf = buf.slice(offset + len);
  }
  socket._buf = buf;
}

// ---------- 业务变更后广播 ----------
function pushOrders() { broadcast({ type: "orders", orders: ORDERS }); }
function pushMenu() { broadcast({ type: "menu", menu: MENU }); }

function newOrderId() {
  return "ORD" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000);
}

// ---------- HTTP / REST ----------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json"
};

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); }
    });
  });
}
function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404); res.end("404 Not Found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(d);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  // WebSocket 升级
  if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === "websocket") {
    handleWsUpgrade(req, req.socket);
    return;
  }

  // ---- API ----
  if (url === "/api/menu" && req.method === "GET") return sendJson(res, 200, MENU);
  if (url === "/api/menu" && req.method === "POST") {
    const body = await readBody(req);
    if (Array.isArray(body)) { MENU = body; saveMenu(MENU); pushMenu(); }
    return sendJson(res, 200, { ok: true });
  }

  if (url === "/api/orders" && req.method === "GET") return sendJson(res, 200, ORDERS);

  if (url === "/api/orders" && req.method === "POST") {
    const b = await readBody(req);
    const order = {
      id: newOrderId(),
      table: String(b.table || "0"),
      items: Array.isArray(b.items) ? b.items : [],
      total: Number(b.total) || 0,
      count: Number(b.count) || 0,
      note: b.note || "",
      status: "pending",
      paid: false,
      urge: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    ORDERS.unshift(order);
    saveOrders(ORDERS);
    pushOrders();
    return sendJson(res, 200, order);
  }

  // PATCH /api/orders/:id  （GET /api/orders/:id 也复用此匹配）
  const m = url.match(/^\/api\/orders\/([\w-]+)$/);
  if (m && req.method === "GET") return sendJson(res, 200, ORDERS.find((x) => x.id === m[1]) || { error: "not found" });
  if (m && req.method === "PATCH") {
    const id = m[1];
    const b = await readBody(req);
    const o = ORDERS.find((x) => x.id === id);
    if (!o) return sendJson(res, 404, { error: "not found" });
    if (b.status) o.status = b.status;
    if (typeof b.urge === "boolean") o.urge = b.urge;
    if (b.note !== undefined) o.note = b.note;
    if (b.paid !== undefined) o.paid = b.paid;
    if (Array.isArray(b.addItems)) {
      b.addItems.forEach((it) => {
        const ex = o.items.find((x) => x.id === it.id);
        if (ex) ex.qty += it.qty; else o.items.push(it);
      });
      o.count = o.items.reduce((s, x) => s + x.qty, 0);
      o.total = o.items.reduce((s, x) => s + x.qty * x.price, 0);
    }
    o.updatedAt = Date.now();
    saveOrders(ORDERS);
    pushOrders();
    return sendJson(res, 200, o);
  }

  // 支付（沙箱）：创建支付单
  if (url === "/api/pay/create" && req.method === "POST") {
    const b = await readBody(req);
    const order = ORDERS.find((x) => x.id === b.orderId);
    if (!order) return sendJson(res, 404, { error: "not found" });
    // 真实环境此处应调用微信/支付宝统一下单接口，返回 payUrl / code_url
    const method = b.method === "alipay" ? "alipay" : "wechat";
    const payUrl = `https://pay.example.com/mock?order=${order.id}&method=${method}`;
    return sendJson(res, 200, { ok: true, method, payUrl, mock: true, orderId: order.id });
  }
  // 支付（沙箱）：模拟支付成功回调
  if (url === "/api/pay/success" && req.method === "POST") {
    const b = await readBody(req);
    const o = ORDERS.find((x) => x.id === b.orderId);
    if (!o) return sendJson(res, 404, { error: "not found" });
    o.paid = true;
    saveOrders(ORDERS);
    pushOrders();
    return sendJson(res, 200, { ok: true });
  }

  if (url.startsWith("/api/")) return sendJson(res, 404, { error: "no route" });

  // ---- 静态 ----
  serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("扫码点餐服务已启动: http://localhost:" + PORT);
  console.log("顾客端: /        后厨端: /kitchen.html   后台: /admin.html");
  console.log("局域网手机访问：http://<本机IP>:" + PORT + "/?table=12");
});
