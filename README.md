# Tesla CLI

Tesla CLI 是一个基于 TeslaMate / Grafana 的 Tesla 数据查询、可视化与通知工具。

它把几类能力收敛到同一个项目里：
- **CLI 查询**：本地查看车辆、行程、充电、电池等数据
- **Screenshot 渲染**：把行程、充电等结果生成图片
- **MQTT 实时服务**：监听 TeslaMate MQTT 事件并触发通知/截图
- **OpenClaw 使用约定**：通过工作区 `TOOLS.md` 暴露 `tesla` CLI，让 OpenClaw 能自然语言调用 Tesla 能力

如果你想做的不只是“看数据”，而是把 Tesla 数据接到日常使用场景里，这个项目就是为这种需求准备的。

## 从哪里开始

按目标选入口：
- 想先跑起来：[`docs/getting-started.md`](./docs/getting-started.md)
- 想用 CLI 查数据：[`docs/cli.md`](./docs/cli.md)
- 想生成截图：[`docs/screenshots.md`](./docs/screenshots.md)
- 想跑 MQTT 实时通知：[`docs/mqtt-service.md`](./docs/mqtt-service.md)
- 想从 OpenClaw 里使用：[`docs/openclaw/README.md`](./docs/openclaw/README.md)
- 想看查询协议 / 字段语义：[`docs/API-REFERENCE.md`](./docs/API-REFERENCE.md)
- 改完代码想回归：[`docs/REGRESSION-CHECKLIST.md`](./docs/REGRESSION-CHECKLIST.md)

## 核心能力

### 1. CLI 查询

支持查看：
- 车辆基础信息
- 行程 / 充电记录
- 电池状态 / 效率 / 预估续航
- 状态时间线 / 软件更新
- 常去地点 / 里程 / 待机损耗 / 胎压
- 统一 JSON 协议查询入口

详细命令见：[`docs/cli.md`](./docs/cli.md)

### 2. Screenshot / 可视化

内置 Web 渲染页面，可以把查询结果导出成图片，例如：
- 行程轨迹图
- 充电曲线图
- 日报 / 周报 / 月报卡片

适合分享、归档，或者直接发到消息渠道。

详见：[`docs/screenshots.md`](./docs/screenshots.md)

### 3. MQTT 实时通知

订阅 TeslaMate MQTT 主题后，可以感知并处理这些事件：
- 行程结束
- 开始 / 结束充电
- 软件更新可用
- 停车后再开车时的待机损耗
- 导航相关提醒
- 停车后周边信息查询与推送

详见：[`docs/mqtt-service.md`](./docs/mqtt-service.md)

### 4. OpenClaw 使用方式

实际使用方式是：
- 通过 `tesla` CLI 提供查询、截图、发送能力
- 通过工作区 `TOOLS.md` 告诉 OpenClaw 本机有哪些 Tesla 命令、该怎么调用
- 通过 PM2 持续运行 MQTT 检测服务，负责自动化通知链路

详见：[`docs/openclaw/README.md`](./docs/openclaw/README.md)

## npm 全局安装

```bash
npm install -g tesla-cli2
tesla --version
tesla config init
```

如果你要跑 MQTT 常驻服务：

```bash
npm install -g pm2
tesla service install
tesla service status
```

## 自动发布到 npm

仓库已包含：
- `.github/workflows/ci.yml`：push / PR 时执行测试和构建
- `.github/workflows/release.yml`：push `v*` tag 时自动发布 npm

使用方式：

```bash
# 1. 确认 package.json version 已更新
git add .
git commit -m "chore: release v1.0.0"
git tag v1.0.0
git push origin main --follow-tags
```

在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：
- `NPM_TOKEN`

`NPM_TOKEN` 来自 npm 网站的 Access Token，建议使用 publish 权限最小化配置。

## 快速开始

### 本地 CLI

```bash
pnpm install
pnpm build
pnpm exec tesla config init
pnpm exec tesla cars -o json
pnpm exec tesla drives 1 -l 5
```

### 统一协议查询

```bash
pnpm exec tesla query '{"version":"1.0","type":"drives","carId":1,"timeRange":{"semantic":"last_7_days"}}'
```

### 启动 MQTT 服务

```bash
pnpm exec tesla mqtt listen
```

### 生成截图

```bash
pnpm exec tesla screenshot drive --record-id 4275 -o /tmp/drive.png
```

## 项目结构

```text
src/
  cli/        Commander CLI 命令层
  core/       Grafana 查询、业务服务、时间语义、MQTT 逻辑
  web/        截图/可视化页面（Vite + React）
  config/     configstore 配置读取
  types/      查询结果与协议类型
scripts/      调试脚本、数据采集、MQTT 测试
docs/         分主题文档
tests/        查询与命令级回归测试
```

## 架构概览

```text
TeslaMate (Postgres)
   ↓
Grafana datasource / API
   ↓
src/core/query-executor.ts
   ├─ CLI commands
   ├─ Screenshot rendering
   ├─ OpenClaw CLI-based integration
   └─ MQTT event handlers
```

一句话理解：**数据入口尽量统一收口在 `core`，CLI / 截图 / MQTT / OpenClaw（经由 CLI）只是不同出口。**

## 配置方式

项目运行时配置主要走 `configstore`，而不是把环境变量散在各处。

常见必填项：
- `grafana.url`
- `grafana.token`
- `grafana.datasourceUid`
- `openclaw.channel`
- `openclaw.target`
- MQTT 相关配置（如果启用 MQTT service）

说明：这里的 `openclaw.*` 是 **CLI / 自动通知发送配置**。

初始化与排障见：[`docs/getting-started.md`](./docs/getting-started.md)

## 开发脚本

```bash
pnpm install
pnpm dev           # CLI 开发模式
pnpm dev:web       # Web 页面开发
pnpm build         # 构建 CLI + Web
pnpm build:cli     # 仅构建 CLI
pnpm build:web     # 仅构建 Web
pnpm test          # watch
pnpm test:run      # 一次性测试
```

## 阅读建议

如果你要快速理解这个仓库，推荐按这个顺序看：
1. `src/cli/index.ts`
2. `src/core/query-executor.ts`
3. `src/core/services/*`
4. `src/web/*`
5. `src/cli/commands/mqtt.ts` + `src/core/services/mqtt-service.ts`
6. `docs/openclaw/*` + OpenClaw 工作区 `TOOLS.md`

## 说明

这个 README 只保留项目定位、能力概览和入口导航。
安装、命令、协议、回归等细节，统一拆分到 `docs/` 下维护。

如果你是第一次接这个仓库，建议先看：[`docs/getting-started.md`](./docs/getting-started.md)
