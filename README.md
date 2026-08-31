# 扫码点餐 PWA（Supabase 云端同步版）

一个**纯前端、可离线、可安装**的扫码点餐 PWA，数据通过 [Supabase](https://supabase.com)（Postgres + Realtime）实现**云端实时同步**——顾客下单、后厨推进状态，两端即时联动。

> 因为是纯静态站点，构建产物可直接托管到 **GitHub Pages / Vercel / Netlify / 任意静态空间**，无需自己的服务器。

## 功能
- 📱 顾客端：扫码进入点餐页 → 点菜加购 → 提交订单 → **自动获得「今日第 N 单」序号** → 实时跟踪状态（待制作→制作中→已出餐→已完成）
- 👨‍🍳 后厨端：实时接单台，一键推进状态，支持催单高亮、订单备注、加菜、打印小票（同样按「今日第 N 单」查看）
- 🛠 后台端：分类 / 菜品（名称·价格·描述·emoji·图片URL·**自主上传图片**）增删改，保存即同步前台
- 💳 支付：微信 Native 扫码付（真实接入见下文）；未配置时自动降级为「模拟支付成功」
- ⚙️ 连接设置：Supabase 地址 / anon key 默认**写进代码 `js/config.js` 的 `FALLBACK_CONFIG`**（anon key 是公开密钥，受 RLS 保护，可提交），顾客扫码即用；也可在**应用内设置页 `settings.html`** 临时覆盖（仅本机）。
- 🔔 Realtime：基于 Supabase Realtime 的推送，跨设备 / 跨页面实时同步
- 📲 PWA：可「添加到主屏幕」、离线点餐（应用壳缓存）

> 本版本为**线上点餐**（无桌号），订单按自然日自动编号「今日第 N 单」，由数据库触发器分配，避免并发计数出错。

## 目录结构
```
scan-order-pwa/
├── index.html        # 顾客端
├── kitchen.html      # 后厨/商家端
├── admin.html        # 菜单后台管理
├── settings.html     # ★ Supabase 连接设置（自行填写，存浏览器本地）
├── manifest.json     # PWA 清单
├── sw.js             # Service Worker（应用壳缓存）
├── css/style.css
├── js/
│   ├── config.js     # 配置读取（FALLBACK_CONFIG 写死生产配置 + localStorage 覆盖）
│   ├── api.js        # 数据层（Supabase 客户端 + Realtime）
│   ├── menu.js       # 状态机 + 默认菜单（离线兜底）
│   ├── app.js        # 顾客端逻辑
│   ├── kitchen.js    # 后厨端逻辑
│   ├── admin.js      # 后台逻辑
│   └── settings.js   # 设置页逻辑
├── icons/            # PWA 图标
├── qrcodes/          # 点餐二维码（无桌号）
├── supabase/
│   ├── schema.sql    # 建表 + 每日序号触发器 + RLS + Realtime（一次性执行）
│   └── functions/wechat-pay/index.ts  # 微信支付 Edge Function
└── server/           # 可选：本地 Node 后端（不接 Supabase 时用于本地开发）
```

## 快速开始（3 步）

### 1. 创建 Supabase 项目并执行建表 SQL
1. 打开 https://supabase.com → New project
2. 进入 **SQL Editor** → 新建查询 → 粘贴 `supabase/schema.sql` 全部内容 → **Run**
   - 会创建 `menu` / `orders` 两张表、注入默认菜单、开启 Realtime、配置匿名读写 RLS

### 2. 填写 Supabase 配置（两种做法，二选一）

**做法 A（推荐，顾客扫码即用）：写进 `js/config.js`**
打开 `js/config.js`，把顶部的 `FALLBACK_CONFIG` 填成你自己的值：
```js
const FALLBACK_CONFIG = {
  url: "https://xxxxxx.supabase.co",        // Supabase 控制台 Project Settings → API → Project URL
  anonKey: "eyJxxxxxxx..."                  // 同页的 anon public key
};
```
anon key 是**公开密钥**（受 RLS 行级安全保护，不是秘密），可以放心提交到仓库。
填好后部署，所有扫码打开的手机都会自动用这份配置，**不再需要每台设备单独设置**。

**做法 B（可选，临时覆盖）：应用内设置页**
若未配置会在页面顶部出现橙色提示条，点击进入 **`/settings.html`**（或右上角 ⚙️）：
- 填入 **Project URL** 与 **anon public key** →「保存并连接」，信息只存**本机浏览器**
- 仅用于临时切到别的库 / 测试；优先级高于 `FALLBACK_CONFIG`，但换设备 / 清缓存后失效

> ⚠️ 为什么不能只靠设置页？设置页存的是浏览器 `localStorage`，**按设备隔离**。顾客用自己手机扫码时不会有这份配置，于是会看到「未配置」横幅且无法下单。所以上线给顾客用时，务必用做法 A 把 key 写进代码。

### 3. 部署 / 预览
**方式 A：本地预览**
```bash
# 任选一个静态服务器，例如：
npx serve .            # 或 python -m http.server 4173
# 浏览器打开 http://localhost:4173/
```
> 注意：必须经由 HTTP(S) 访问（`file://` 无法注册 Service Worker / 用不了 ES Module）。

**方式 B：GitHub Pages（推荐，永久托管）**
见下方「部署到 GitHub Pages」。

打开 `/`（顾客端）、`/kitchen.html`（后厨）、`/admin.html`（后台）即可体验。
同开两个标签页：顾客加菜提交 → 后厨即时出现 → 推进状态 → 顾客跟踪页同步刷新。

## 部署到 GitHub Pages
1. 在 GitHub 新建一个**空仓库**（不要勾选 README）
2. 本地提交并推送（见仓库根目录，已 `git init`）：
   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git branch -M main
   git push -u origin main
   ```
3. 仓库 → **Settings → Pages → Build and deployment**
   - Source 选 **Deploy from a branch**
   - Branch 选 **main** / 目录 **/ (root)** → Save
4. 约 1 分钟后访问 `https://<你的用户名>.github.io/<仓库名>/`
   - 顾客端：`/`　后厨端：`/kitchen.html`　后台：`/admin.html`　设置：`/settings.html`
5. 手机扫码：用 `qrcodes/order.png`（已生成，指向站点根地址）即可，详见「点餐二维码」。

## 支付说明
顾客端「去支付」会生成**微信扫码付二维码**（真实接入见下文「接入真实微信支付」）。
未部署 Edge Function 或未配置商户密钥时，前端自动降级为「模拟支付成功」，不影响点餐 / 后厨流程演示。

> ⚠️ 不要把 service_role key 或微信商户私钥放到前端。前端只用 anon key（已配置 RLS），商户密钥仅存于 Supabase Secrets。

## 可选的本地后端（不接 Supabase 时）
`server/server.js` 是一个零依赖 Node 服务（REST + 手写 WebSocket + JSON 文件持久化），
适合没有 Supabase 时的本地开发演示。使用：
```bash
PORT=4173 node server/server.js
```
> 本地后端与 Supabase 是两套独立方案：用了 Supabase 就无需启动它；要本地演示可单独运行，
> 但订单/同步数据存于本地文件，不跨设备。生产环境**推荐直接使用 Supabase 方案**。

## 菜品图片自主上传
后台 `admin.html` 每个菜品支持**选择本地图片文件**直接上传：
1. 建表 SQL 已创建公开存储桶 `dish-images` 并放开匿名上传策略；
2. 后台点「选择文件」→ 图片自动上传到 Supabase Storage → 得到公开 URL 写入该菜品 `img`；
3. 点「保存并同步到前台」，顾客端立即显示该图片（无图时回退 emoji）。

> 如需限制仅管理员可上传，把 `schema.sql` 里 `dish-images public upload` 策略改为基于登录用户的 RLS。

## 接入真实微信支付（Native 扫码付）
支付走 **Supabase Edge Function**（`supabase/functions/wechat-pay/index.ts`），商户密钥只存放在服务端（Supabase Secrets），前端永不接触。

1. 本地安装 Supabase CLI 并登录：`npm i -g supabase && supabase login`
2. 部署函数：
   ```bash
   supabase functions deploy wechat-pay
   ```
3. 配置商户密钥（Supabase 控制台 → Project Settings → Edge Functions → Secrets，或命令行）：
   ```bash
   supabase secrets set WECHAT_APPID=你的AppID \
     WECHAT_MCHID=你的商户号 \
     WECHAT_APIV3_KEY=你的APIv3密钥 \
     WECHAT_SERIAL_NO=你的证书序列号 \
     WECHAT_PRIVATE_KEY="$(cat 你的私钥文件.pem)"
   ```
4. 在微信商户平台把回调地址 `https://<你的项目>.supabase.co/functions/v1/wechat-pay?action=notify` 加入支付回调域名白名单。
5. 完成后顾客端「去支付」会生成**微信扫码付二维码**，顾客用微信扫一扫付款；
   微信异步回调解密后把订单 `paid` 置 `true`，顾客端/后厨端实时刷新。

> 未部署函数或密钥未配置时，前端自动降级为「模拟支付成功」，不影响其他流程演示。

## 点餐二维码
线上点餐无需桌号，扫码即进入点餐页。二维码已生成在 `qrcodes/order.png`（指向站点根地址）。
如需重新生成（例如换了站点域名），编辑 `gen_table_qr.py` 顶部的 `BASE_URL` 后运行：
```bash
python gen_table_qr.py
```
- `BASE_URL` 默认 `https://fuckyoumxb.github.io/scan-and-order`（即本仓库的 GitHub Pages 地址）
- 生成的 `qrcodes/order.png` 扫码即进 `/`，下单后自动获得「今日第 N 单」序号

## 说明
- 演示用 RLS 允许匿名读写，便于快速体验；生产环境请为 `orders` 增加 auth / 门店隔离策略。
- 订单与菜单均存于 Supabase 云端，刷新 / 换设备 / 多人操作均实时一致。
- 微信支付相关密钥仅存在于 Supabase Secrets，请妥善保管，不要提交到仓库。
