# 扫码点餐 PWA（Supabase 云端同步版）

一个**纯前端、可离线、可安装**的扫码点餐 PWA，数据通过 [Supabase](https://supabase.com)（Postgres + Realtime）实现**云端实时同步**——顾客下单、后厨推进状态，两端即时联动。

> 因为是纯静态站点，构建产物可直接托管到 **GitHub Pages / Vercel / Netlify / 任意静态空间**，无需自己的服务器。

## 功能
- 📱 顾客端：扫码识别桌号（`?table=12`）→ 点菜加购 → 提交订单 → 实时跟踪状态（待制作→制作中→已出餐→已完成）
- 👨‍🍳 后厨端：实时接单台，一键推进状态，支持催单高亮、订单备注、加菜、打印小票
- 🛠 后台端：分类 / 菜品（名称·价格·描述·emoji·图片URL）增删改，保存即同步前台
- 💳 支付：微信 / 支付宝选择 + 「模拟支付成功」（沙箱）；接真实商户号见下文
- 🔔 Realtime：基于 Supabase Realtime 的 WebSocket 推送，跨设备 / 跨页面实时同步
- 📲 PWA：可「添加到主屏幕」、离线点餐（应用壳缓存）

## 目录结构
```
scan-order-pwa/
├── index.html        # 顾客端
├── kitchen.html      # 后厨/商家端
├── admin.html        # 菜单后台管理
├── manifest.json     # PWA 清单
├── sw.js             # Service Worker（应用壳缓存）
├── css/style.css
├── js/
│   ├── config.js     # ★ 填入你的 Supabase 配置
│   ├── api.js        # 数据层（Supabase 客户端 + Realtime）
│   ├── menu.js       # 状态机 + 默认菜单（离线兜底）
│   ├── app.js        # 顾客端逻辑
│   ├── kitchen.js    # 后厨端逻辑
│   └── admin.js      # 后台逻辑
├── icons/            # PWA 图标
├── qrcodes/          # 示例桌码二维码
├── supabase/
│   └── schema.sql    # 建表 + RLS + Realtime 开启（一次性执行）
└── server/           # 可选：本地 Node 后端（不接 Supabase 时用于本地开发）
```

## 快速开始（3 步）

### 1. 创建 Supabase 项目并执行建表 SQL
1. 打开 https://supabase.com → New project
2. 进入 **SQL Editor** → 新建查询 → 粘贴 `supabase/schema.sql` 全部内容 → **Run**
   - 会创建 `menu` / `orders` 两张表、注入默认菜单、开启 Realtime、配置匿名读写 RLS

### 2. 填入配置
打开 `js/config.js`，替换为你的项目信息（Supabase 控制台 → Project Settings → API）：
```js
export const SUPABASE_URL = "https://xxxx.supabase.co";
export const SUPABASE_ANON_KEY = "你的 anon public key";
```

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
   - 顾客端：`/`（手机扫码即 `?table=12`）
   - 后厨端：`/kitchen.html`　后台：`/admin.html`
5. 手机扫码：把 `qrcodes/table-12.png` 里的 `localhost` 换成你的 GitHub Pages 地址
   （或本机局域网 IP）重新生成桌码即可，详见 `gen_table_qr.py`。

## 接入真实支付（微信 / 支付宝）
当前为沙箱演示（`createPay` 仅返回占位 `payUrl`，`paySuccess` 直接置 `paid=true`）。
生产接入步骤：
1. 在服务端用 Supabase **service_role** key 调用微信支付 JSAPI / 支付宝当面付统一下单，生成支付链接或二维码；
2. 顾客端 `createPay` 拿到真实 `payUrl` 展示二维码；
3. 支付回调成功后，把对应订单 `paid` 置 `true`（Supabase 是云端，后厨端会实时刷新）。

> ⚠️ 不要把 service_role key 放到前端。前端只用 anon key（已配置 RLS）。

## 可选的本地后端（不接 Supabase 时）
`server/server.js` 是一个零依赖 Node 服务（REST + 手写 WebSocket + JSON 文件持久化），
适合没有 Supabase 时的本地开发。使用：
```bash
PORT=4173 node server/server.js
```
要让前端走本地后端而非 Supabase，把 `js/config.js` 的 URL 留空（置为 `""`）即可自动回退到本地兜底菜单；
但订单/同步仍需后端，因此**推荐直接使用 Supabase 方案**。

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

## 桌码二维码
桌码二维码（`qrcodes/table-12.png`）在仓库上传到 GitHub Pages 之后，用实际站点地址重新生成：
```bash
# 把 <你的站点地址> 换成 https://<用户名>.github.io/<仓库名>/
python gen_table_qr.py --base <你的站点地址>
```

## 说明
- 演示用 RLS 允许匿名读写，便于快速体验；生产环境请为 `orders` 增加 auth / 门店隔离策略。
- 订单与菜单均存于 Supabase 云端，刷新 / 换设备 / 多人操作均实时一致。
- 微信支付相关密钥仅存在于 Supabase Secrets，请妥善保管，不要提交到仓库。
