# Tesla CLI 回归自测清单

这份文档用于在改动仓库名、configstore、Grafana 配置、MQTT 推送逻辑后，快速确认 `tesla` CLI 和 `tesla-mqtt` 是否仍然可用。

目标：
- 5 分钟内确认核心链路是否正常
- 优先覆盖最容易因重构/改名而出问题的点
- 出问题时能快速定位是 config、Grafana、MQTT、还是构建产物

---

## 0. 适用场景

建议在以下改动后跑一遍：
- 仓库 rename / 包名 rename
- `src/config/*`、`configstore`、`package.json` 改动
- `src/core/index.ts`、`src/core/grafana-client.ts` 改动
- `mqtt-service` / 推送逻辑改动
- `build` / `dist` 相关改动
- pm2 / 启动脚本改动

---

## 1. 前置检查

### 1.1 确认本地配置存在

```bash
cat ~/.config/configstore/tesla-cli.json
```

至少要有这些字段：
- `grafana.url`
- `grafana.token`
- `grafana.datasourceUid`
- `openclaw.channel`
- `openclaw.target`
- `mqtt.host`
- `mqtt.port`
- `mqtt.carId`
- `mqtt.topicPrefix`

如果没有，就先：

```bash
tesla config init
# 或
node scripts/bootstrap-configstore-from-env.mjs
```

### 1.2 检查当前配置是否能被 CLI 读到

```bash
pnpm exec tesla config get
pnpm exec tesla config doctor
```

期望：
- `config get` 能正常打印配置（token 会打码）
- `config doctor` 输出 `OK`

---

## 2. 构建与基础命令检查

### 2.1 重新构建 CLI

```bash
pnpm build:cli
```

期望：
- 无 TypeScript 编译错误

### 2.2 基础 help 检查

```bash
pnpm exec tesla --help
pnpm exec tesla config --help
```

期望：
- 命令名保持为 `tesla`
- 能看到各子命令

---

## 3. Grafana 数据链路检查

### 3.1 最小可用查询

```bash
pnpm exec tesla cars -o json
```

期望：
- 返回车辆数组 JSON
- 不应该出现以下错误：
  - `query.invalidDatasourceId`
  - `Missing required config: grafana.datasourceUid`
  - `401/403`

### 3.2 再测一个非 cars 命令

```bash
pnpm exec tesla battery 1 -o json
```

或：

```bash
pnpm exec tesla drives 1 -l 1 -o json
```

期望：
- 能返回数据
- 说明不只是基础连接通了，核心查询也正常

### 3.3 如果怀疑是 datasource UID 问题

直接验证 Grafana 上的 datasource：

```bash
URL=$(jq -r '.grafana.url' ~/.config/configstore/tesla-cli.json)
TOKEN=$(jq -r '.grafana.token' ~/.config/configstore/tesla-cli.json)
UID=$(jq -r '.grafana.datasourceUid' ~/.config/configstore/tesla-cli.json)

curl -sS -H "Authorization: Bearer $TOKEN" "$URL/api/datasources/uid/$UID"
```

期望：
- 能返回 datasource JSON
- `uid` 与本地配置一致

如果这里正常，但 CLI 仍报 `query.invalidDatasourceId`，优先检查：
- `src/core/index.ts` 是否把 `config.grafana.datasource` 传给了 `GrafanaClient`
- 是否忘了 `pnpm build:cli`
- pm2 是否还跑着旧代码

---

## 4. pm2 / MQTT 服务检查

### 4.1 重启服务

```bash
pm2 restart ecosystem.config.cjs --only tesla-mqtt
# 如果上面不行：
pm2 restart tesla-mqtt
```

### 4.2 查看状态

```bash
pm2 status tesla-mqtt
```

期望：
- `status = online`

### 4.3 查看最近日志

```bash
pm2 logs tesla-mqtt --lines 80 --nostream
```

期望看到：
- `MQTT 服务配置:`
- `正在连接 MQTT Broker:`
- `MQTT 连接成功`
- 多条 `已订阅: teslamate/cars/1/...`

如果失败，常见定位：
- MQTT 连不上 → `mqtt.host` / `mqtt.port` / 网络问题
- Grafana 查询失败 → `grafana.datasourceUid` / token / CLI 构建问题
- pm2 能起但逻辑不对 → 常见是 `dist/` 没更新或者服务跑的不是你以为的目录

---

## 5. 截图链路检查（可选，但推荐）

如果改动过 screenshot / OpenClaw / Grafana 查询，建议补一条：

```bash
pnpm dev screenshot drive -o /tmp/drive-latest.png
ls -lh /tmp/drive-latest.png
```

期望：
- 能生成文件
- 文件大小正常，不是 0 字节

如果要测试发出：

```bash
pnpm dev screenshot drive --send -o /tmp/drive-latest.png
```

注意：这会触发真实发送，回归测试时按需执行。

---

## 6. MQTT 事件模拟（验证推送链路）

如果需要验证停车 / 更新推送，不一定要等真实车事件，可以直接模拟。

### 6.1 状态变更测试

```bash
./scripts/mqtt-test.sh state online
./scripts/mqtt-test.sh state driving
./scripts/mqtt-test.sh state online
```

或直接用 `mosquitto_pub`：

```bash
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/state -m "online"
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/state -m "driving"
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/state -m "online"
```

期望：
- 日志里出现状态变化
- 如果策略命中，会触发对应推送/截图逻辑

### 6.2 软件更新推送测试

```bash
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/update_version -m "2099.99.1"
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/update_available -m "true"
```

清理测试状态：

```bash
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/update_available -m "false"
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/update_version -m ""
```

---

## 7. 回归通过标准

满足以下条件，就可以认为核心链路通过：

- `pnpm build:cli` 成功
- `pnpm exec tesla config doctor` 输出 `OK`
- `pnpm exec tesla cars -o json` 返回正常数据
- `pm2 status tesla-mqtt` 显示 `online`
- `pm2 logs tesla-mqtt --lines 80 --nostream` 中能看到 MQTT 连接成功和订阅成功

推荐附加通过项：
- `pnpm exec tesla battery 1 -o json` 正常
- `pnpm dev screenshot drive -o /tmp/drive-latest.png` 正常

---

## 8. 这次踩过的坑

### 8.1 configstore 里有 datasourceUid，不代表 CLI 一定在用

这次实际问题不是 UID 没写进去，而是：
- CLI 创建 `GrafanaClient` 时
- 漏传了 `datasource: config.grafana.datasource`
- 导致运行时请求里 datasource UID 为空
- 最终报错：`query.invalidDatasourceId`

所以以后遇到这个报错，优先检查：
- 配置文件里有没有 UID
- 代码有没有把它真的传到 `GrafanaClient`
- 是否已经重新 build / restart

### 8.2 改了 `src/` 不等于 pm2 已经用上新代码

如果 pm2 跑的是构建产物或启动脚本依赖 `dist/`：
- 改完源码后记得 `pnpm build:cli`
- 然后再 `pm2 restart`

不然很容易出现：
- 你以为代码修了
- 实际线上进程还在跑旧逻辑

---

## 9. 推荐的一键回归顺序

```bash
cd /Users/fox/Documents/fly/tesla-service
pnpm build:cli
pnpm exec tesla config doctor
pnpm exec tesla cars -o json
pm2 restart ecosystem.config.cjs --only tesla-mqtt || pm2 restart tesla-mqtt
pm2 status tesla-mqtt
pm2 logs tesla-mqtt --lines 50 --nostream
```

如果上面都过，再按需补：

```bash
pnpm exec tesla battery 1 -o json
pnpm dev screenshot drive -o /tmp/drive-latest.png
```
