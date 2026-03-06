# Tesla CLI

一个基于 TeslaMate / Grafana 的 Tesla 数据查询与可视化工具。

它现在同时承担 4 件事：
- CLI：本地查询车辆、行程、充电、电池等数据
- Screenshot：把查询结果渲染成分享图
- MQTT service：监听 TeslaMate MQTT 事件并触发通知/截图
- OpenClaw plugin：给 OpenClaw 提供 `/tesla` 命令和 `tesla_query` tool

这类项目最容易把 README 写成“功能流水账”。这里改成渐进式暴露：
- 先讲这项目是什么、适合谁、怎么跑起来
- 再按使用场景拆到 `docs/`
- 细节 API / 回归清单单独维护，不堵在首页

## 你应该先看哪一份

按你的目标选：
- 想先跑起来：[`docs/getting-started.md`](./docs/getting-started.md)
- 想用 CLI 查数据：[`docs/cli.md`](./docs/cli.md)
- 想生成截图或发图：[`docs/screenshots.md`](./docs/screenshots.md)
- 想跑 MQTT 实时通知：[`docs/mqtt-service.md`](./docs/mqtt-service.md)
- 想从 OpenClaw 视角使用 Tesla：[`docs/openclaw/README.md`](./docs/openclaw/README.md)
- 想接 OpenClaw 插件：[`docs/openclaw-plugin.md`](./docs/openclaw-plugin.md)
- 想看完整查询协议 / 字段语义：[`docs/API-REFERENCE.md`](./docs/API-REFERENCE.md)
- 改完代码想回归：[`docs/REGRESSION-CHECKLIST.md`](./docs/REGRESSION-CHECKLIST.md)

## 项目结构

```text
src/
  cli/        Commander CLI 命令层
  core/       Grafana 查询、业务服务、时间语义、MQTT 逻辑
  plugin/     OpenClaw 插件入口（command + tool）
  web/        截图/可视化页面（Vite + React）
  config/     configstore 配置读取
  types/      查询结果与协议类型
scripts/      调试脚本、数据采集、MQTT 测试
docs/         分主题文档
tests/        查询与命令级回归测试
```

## 核心架构

```text
TeslaMate(Postgres)
   ↓
Grafana datasource / API
   ↓
src/core/query-executor.ts
   ├─ CLI commands
   ├─ Screenshot rendering
   ├─ OpenClaw tool / command
   └─ MQTT event handlers
```

一句话理解：**数据入口尽量统一收口在 `core`，CLI / 插件 / 截图 / MQTT 只是不同出口。**

## 功能概览

### 1. CLI 查询

支持的主命令包括：
- `cars` / `car`
- `drives` / `charges`
- `battery` / `efficiency` / `projected-range`
- `states` / `updates` / `timeline`
- `locations` / `visited` / `where`
- `mileage` / `vampire` / `tpms`
- `stats charging|driving|period`
- `detail drive|charge`
- `query`（统一 JSON 协议入口）
- `config` / `mqtt` / `screenshot` / `notify` / `nav`

详细命令见：[`docs/cli.md`](./docs/cli.md)

### 2. Screenshot / 可视化

项目内置 web 渲染页面，用于把行程、充电、日报/周报/月报等数据导出成图片。

适合：
- 发到 Telegram / OpenClaw
- 做日报分享
- 把原始 JSON 变成更可读的视觉卡片

详见：[`docs/screenshots.md`](./docs/screenshots.md)

### 3. MQTT 实时通知

订阅 TeslaMate MQTT 主题，感知：
- 行程结束
- 开始/结束充电
- 软件更新可用
- 停车后再开车时的待机损耗
- 导航相关事件（代码里已有相关命令/能力）

详见：[`docs/mqtt-service.md`](./docs/mqtt-service.md)

### 4. OpenClaw 插件

仓库可以直接作为 OpenClaw 插件接入，提供：
- `/tesla` slash command
- `tesla_query` AI tool

详见：[`docs/openclaw-plugin.md`](./docs/openclaw-plugin.md)

## 快速印象：这个项目怎么用

### 本地 CLI

```bash
pnpm install
pnpm build
pnpm exec tesla config init
pnpm exec tesla cars -o json
pnpm exec tesla drives 1 -l 5
```

### 用统一协议查询

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

> 具体参数以对应命令帮助和 `docs/` 为准；首页只保留“怎么开始”的骨架。

## 开发脚本

```bash
pnpm install
pnpm dev           # CLI 开发模式
pnpm dev:web       # Web 预览/截图页面开发
pnpm build         # 构建 CLI + Web
pnpm build:cli     # 仅构建 CLI
pnpm build:web     # 仅构建 Web
pnpm test          # watch
pnpm test:run      # 一次性测试
```

## 配置方式

项目运行时配置主要走 `configstore`，而不是把环境变量散在各处。

常见必填项：
- `grafana.url`
- `grafana.token`
- `grafana.datasourceUid`
- `openclaw.channel`
- `openclaw.target`
- MQTT 相关配置（如果你启用 MQTT service）

初始化与排障见：[`docs/getting-started.md`](./docs/getting-started.md)

## 适合维护的文档策略

这个仓库后续建议继续遵守下面的拆分方式：
- `README.md`：只放定位、架构、入口、导航
- `docs/getting-started.md`：安装、配置、首次跑通
- `docs/cli.md`：命令使用
- `docs/screenshots.md`：截图与可视化
- `docs/mqtt-service.md`：监听服务、事件、调试
- `docs/openclaw-plugin.md`：插件接入
- `docs/API-REFERENCE.md`：协议与字段定义
- `docs/REGRESSION-CHECKLIST.md`：回归检查

这样改代码的人看首页不累，排障的人也能直接跳到对应文档。

## 代码阅读建议

如果你要快速理解代码，推荐按这个顺序看：
1. `src/cli/index.ts`：先看外部能力边界
2. `src/core/query-executor.ts`：看统一查询入口
3. `src/core/services/*`：看各类领域逻辑
4. `src/plugin/*`：看 OpenClaw 接入面
5. `src/web/*`：看截图渲染层
6. `src/cli/commands/mqtt.ts` + `src/core/services/mqtt-service.ts`：看实时事件链路

## 注意

- 不要在每次很小的改动后都 commit / push
- 先本地批量改，用户明确要求时再提交
- 配置与运行环境问题，优先看 `configstore` 是否完整，再看 Grafana datasource UID 是否正确

---

如果你是第一次接这个仓库，先去看：[`docs/getting-started.md`](./docs/getting-started.md)
