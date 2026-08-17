# 拿下 Nail It · 极简后端部署指南

> 用途：让「校招情报」从**管理员每天上传 CSV → 全员自动同步并显示「新」字**，并**静默接收用户反馈**给开发者。
> 特点：**零依赖**（仅 Node 内置模块），一个 Node 进程同时托管产品页 + 提供 API，可直接跑在 CloudBase / EdgeOne / 任意 Node 环境。

---

## 一、目录结构（直接整体上传即可）

```
backend/
├── intel-server.js   # 零依赖 Node 服务：静态托管 + 校招情报同步 + 反馈接收
├── admin.html        # 管理员后台：上传 CSV / 查看反馈（需 ADMIN_KEY）
├── package.json      # 无需 npm install（无第三方依赖）
├── Dockerfile        # 云托管用（可选）
├── DEPLOY.md         # 本文件
└── data/             # 运行时自动生成（情报 + 反馈），不要手动改
    ├── intel.json      # 当前线上校招情报（首次启动自动从产品页内置 CSV 播种）
    └── feedback.json   # 用户反馈记录
```

产品页 `our-plugin-web-v4-white.html` 放在 **backend 的上级目录**（即 `product-roadmap/`），服务会自动把它当作首页。

---

## 二、本地跑通（已验证）

```bash
cd backend
ADMIN_KEY=你的密钥 PORT=3000 node intel-server.js
# 打开 http://localhost:3000/   首页是产品页
# 打开 http://localhost:3000/admin  管理员后台（输入 ADMIN_KEY）
```

环境变量：

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 监听端口 | `3000` |
| `ADMIN_KEY` | 管理员密钥（上传情报/看反馈必须带） | `rfa-admin-2026`（**上线必须改！**） |
| `STATIC_DIR` | 静态目录（放产品页的地方） | 本文件上级目录 |
| `FEEDBACK_WEBHOOK` | 反馈转发 Webhook（企业微信/飞书/Slack 机器人，可选） | 空（不转发） |
| `FEEDBACK_EMAIL` | 仅展示用，不实际发信 | 空 |

---

## 三、部署到腾讯云开发 CloudBase（推荐，最省事）

CloudBase「云托管」可直接运行一个 Node HTTP 服务，静态页 + API 一把梭。

### 步骤
1. 腾讯云控制台 → **云开发 CloudBase** → 新建环境（选「云托管」）。
2. 安装 CloudBase CLI：`npm i -g @cloudbase/cli`（本机装一次即可，上线只需在云上操作）。
3. 把 `backend/` 整个目录上传（或在云托管里关联 Git 仓库自动构建）。
4. 服务设置：
   - **监听端口**：`3000`
   - **启动命令**：`node intel-server.js`
   - **环境变量**：`ADMIN_KEY=改成你自己的强随机串`、`PORT=3000`
5. 部署完成后，云托管会给你一个公网域名，例如 `https://xxx.ap-shanghai.app.tcloudbase.com`。
6. 把产品页域名填回前端：前端默认请求同源 `/api/intel`，所以**产品页和后端必须是同一个域名/源**——CloudBase 云托管正好满足（静态页和 API 同一服务同源）。

> 提示：CloudBase 云托管按量计费，空闲几乎不花钱；首次部署选「内网创建」即可。

### Dockerfile（云托管用，放 backend/ 下）
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production 2>/dev/null || true
COPY . .
EXPOSE 3000
ENV PORT=3000
CMD ["node", "intel-server.js"]
```

---

## 四、部署到 EdgeOne Pages（备选）

EdgeOne Pages 适合纯静态；但因我们带了 Node 后端，更推荐用 **EdgeOne「边缘函数 / Node 运行时」** 或直接用 CloudBase。若坚持 EdgeOne：

- 用 **EdgeOne Pages + Functions（Node 运行时）**：把 `intel-server.js` 改成导出 `export default { fetch(req){...} }` 的函数式入口（当前是 `http.createServer` 形态，需小改）。
- 静态页走 Pages 托管，API 走 `/api/*` 函数路由。
- 同样设置环境变量 `ADMIN_KEY`。

> 当前版本优先 CloudBase（零改造成本）。EdgeOne 如需，我可再出一版「函数式入口」适配。

---

## 五、管理员日常操作（你每天要做的事）

1. 打开 `https://你的域名/admin`，输入 `ADMIN_KEY`。
2. 点「查看当前线上情报」确认现状。
3. 用「选择 CSV 文件」选中新一天的校招情报 CSV → 点「上传并更新」。
4. 全员下次打开产品页（或切回标签页）会自动拉取，校招情报右侧出现 **「新」** 字。
5. 「用户反馈」区域可查看所有用户提交的反馈（也可配置 `FEEDBACK_WEBHOOK` 直接转发到你的企业微信/飞书）。

CSV 格式：第一行是表头，列随意（产品页会自动识别列名渲染）。最简单的两列也行：`公司,岗位`；完整版参考产品页内置的 ~970 行示例。

---

## 六、安全与注意事项

- ⚠️ **`ADMIN_KEY` 必须改**成只有你知道的强随机串，否则任何人都能上传情报/看反馈。
- 上传/读反馈接口是 `Bearer <ADMIN_KEY>` 鉴权；公开接口只有「读情报」「提交反馈」。
- `data/` 目录包含用户反馈（可能含联系方式），**不要公开分享**；定期备份即可。
- 反馈正文上限 5000 字、联系方式 200 字，防滥用。
- 诊断包导出（`?diag=1` 触发）**不含任何密码/密钥/Token**，可放心让用户发给你排查。

---

## 七、接口速查

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET  | `/api/intel` | 公开 | 返回当前情报 `{csv, updatedAt, version, count}` |
| POST | `/api/intel/upload` | Bearer ADMIN_KEY | body `{csv}` 更新情报 |
| POST | `/api/feedback` | 公开 | body `{t, ver, page, desc, contact?}` 接收反馈 |
| GET  | `/api/feedback` | Bearer ADMIN_KEY | 列出全部反馈 |
| GET  | `/admin` | — | 管理员后台页 |
| 任意 | 其他路径 | — | 静态托管产品页 |
