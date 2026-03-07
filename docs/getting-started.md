# Getting Started

这份文档说明如何把项目跑起来，并完成最基本的验证。

## 1. 环境要求

- Node.js 20+
- pnpm
- 可访问的 Grafana
- 对应 TeslaMate 的 Grafana datasource

如果要使用截图功能，机器上还需要能运行 Puppeteer。

## 2. 安装依赖

```bash
pnpm install
```

## 3. 构建

```bash
pnpm build
```

如果只想先验证 CLI：

```bash
pnpm build:cli
```

## 4. 初始化配置

项目运行时配置使用 `configstore`。

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

如果还要运行 MQTT service，还需要：
- `mqtt.host`
- `mqtt.port`
- `mqtt.carId`
- `mqtt.topicPrefix`

## 5. 如何找到 `grafana.datasourceUid`

在 Grafana 中：
- 进入 Connections → Data sources
- 打开 TeslaMate 使用的 datasource

从页面 URL 中获取 UID：
- 如果 URL 是 `/datasources/edit/<uid>`
- 那么 `<uid>` 就是 `grafana.datasourceUid`

注意不要填成 datasource name 或 numeric id。

## 6. 运行一个最小查询

```bash
pnpm exec tesla cars -o json
```

如果这个命令能正常返回车辆数组，通常说明：
- CLI 可以正常运行
- Grafana token 基本可用
- datasource UID 基本正确

再补一个查询：

```bash
pnpm exec tesla battery 1 -o json
```

## 7. 常见错误

### `Missing required config: grafana.datasourceUid`

没有配置 datasource UID，或者配置没有写到当前机器的 configstore。

### `query.invalidDatasourceId`

通常是 UID 配错，或者 Grafana datasource 已发生变化。

### `401/403`

Grafana token 权限不足，或者 URL / token 配置有误。

## 8. 下一步

- CLI 使用说明：[`./cli.md`](./cli.md)
- 截图与可视化：[`./screenshots.md`](./screenshots.md)
- MQTT 实时监听：[`./mqtt-service.md`](./mqtt-service.md)
- OpenClaw 插件接入：[`./openclaw-plugin.md`](./openclaw-plugin.md)
