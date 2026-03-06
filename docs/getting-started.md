# Getting Started

这份文档只回答一件事：**怎么把项目跑起来。**

## 1. 环境要求

- Node.js 20+
- pnpm
- 可访问的 Grafana
- Grafana 对应的 TeslaMate datasource

如果要用截图功能，机器上还需要能跑 Puppeteer。

## 2. 安装依赖

```bash
pnpm install
```

## 3. 构建

```bash
pnpm build
```

如果你只想先验证 CLI：

```bash
pnpm build:cli
```

## 4. 初始化配置

本项目运行时配置走 `configstore`。

交互式初始化：

```bash
pnpm exec tesla config init
```

检查配置：

```bash
pnpm exec tesla config doctor
pnpm exec tesla config get
```

常见必填项：
- `grafana.url`
- `grafana.token`
- `grafana.datasourceUid`
- `openclaw.channel`
- `openclaw.target`

如果你还要跑 MQTT service，还需要：
- `mqtt.host`
- `mqtt.port`
- `mqtt.carId`
- `mqtt.topicPrefix`

## 5. `grafana.datasourceUid` 怎么找

去 Grafana：
- Connections → Data sources → 打开 TeslaMate 用的 datasource

从页面 URL 里拿 UID：
- 如果 URL 是 `/datasources/edit/<uid>`
- 那 `<uid>` 就是 `grafana.datasourceUid`

注意别填成 datasource name 或 numeric id。

## 6. 跑一个最小查询

```bash
pnpm exec tesla cars -o json
```

如果这个命令能正常返回车辆数组，说明：
- CLI 能跑
- Grafana token 基本没问题
- datasource UID 基本没问题

再补一个查询：

```bash
pnpm exec tesla battery 1 -o json
```

## 7. 常见错误

### `Missing required config: grafana.datasourceUid`

没配 datasource UID，或者配置没写到当前机器的 configstore。

### `query.invalidDatasourceId`

高概率是 UID 配错，或者 Grafana datasource 已变更。

### `401/403`

Grafana token 权限不对，或者 URL / token 错了。

## 8. 下一步看哪里

- 想用 CLI：[`./cli.md`](./cli.md)
- 想出图：[`./screenshots.md`](./screenshots.md)
- 想跑 MQTT 实时监听：[`./mqtt-service.md`](./mqtt-service.md)
- 想接 OpenClaw：[`./openclaw-plugin.md`](./openclaw-plugin.md)
