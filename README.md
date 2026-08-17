# Get Offer · 校招网申一键填充助手（网页版 + 开发者后端）

> 产品页 `index.html`（Get Offer 校招网申助手网页版），配套一个**零依赖 Node 后端**：校招情报云端同步 + 用户反馈接收 + 隐藏诊断导出。

## 给最终用户
- 打开产品页即可使用「校招情报 / 资料库 / 投递记录 / 问题反馈 / 隐藏诊断」。
- 管理员上传新情报后，你这边「校招情报」会出现 **「新」** 字，点进去查看后消失。
- 遇到问题：在地址后加 `?diag=1`（或连点左上角 logo 5 下）→ 导出诊断包发给开发者。

## 给开发者（你）
- **每天上传校招情报**：打开 `/admin` → 输入 ADMIN_KEY → 选 CSV 上传，全员自动同步。
- **看用户反馈**：`/admin` 里的「用户反馈」列表（或配置 `FEEDBACK_WEBHOOK` 转发到企业微信/飞书）。
- 详细部署与日常操作见 `backend/DEPLOY.md`。

## 部署（二选一，都已配好）
1. **Render（推荐，今天就能上线）**：在 Render 控制台 `New → Blueprint`，选本仓库，点 Deploy。
   零配置（`render.yaml` 已写好）。部署后在 Render 的 Environment 把 `ADMIN_KEY` 设成你自己的强随机串。
   免费版空闲会休眠，首个用户访问有约数秒冷启动；常驻约 $5–7/月。
2. **腾讯云开发 CloudBase（国内访问更快、常驻）**：按 `backend/DEPLOY.md` 用云托管 + `Dockerfile` 部署（需腾讯云账号，实名约需一点时间）。

## 本地运行
```bash
cd backend
ADMIN_KEY=你的密钥 PORT=3000 node intel-server.js
# 产品页：http://localhost:3000/
# 管理后台：http://localhost:3000/admin
```

## 目录
```
index.html            产品页（Get Offer 网页版）
backend/
  intel-server.js     零依赖 Node 服务（静态托管 + 校招情报/反馈 API）
  admin.html          管理后台
  DEPLOY.md           部署与日常操作说明
  Dockerfile          CloudBase/容器部署用
.env.example          环境变量模板（复制为 .env 填写）
render.yaml          Render 一键部署配置
data/                运行时自动生成（情报 + 反馈），不入库
```
