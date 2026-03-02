# Tesla Service (Clateslaw)

基于 TeslaMate 的 Tesla 数据服务 CLI 工具，为 [OpenClaw](https://github.com/anthropics/openclaw) 提供 Tesla 车辆数据查询能力。

## Dev workflow (note)

- Do not commit/push after every small change.
- Batch changes locally; only commit/push when the user explicitly asks to submit/push.

## 核心用途

本项目主要作为 OpenClaw 的 Skill 使用，通过自然语言与 AI 交互查询 Tesla 车辆数据：

```
用户: "给我看看最近的行程"
  ↓
AI (OpenClaw Skill) 解析自然语言
  ↓
生成 TeslaQuery JSON
  ↓
执行 tesla screenshot query '<json>' --send
  ↓
截图发送到 Telegram
```

**Skill 文档**: [`skills/tesla/SKILL.md`](./skills/tesla/SKILL.md)

## OpenClaw 插件

本项目可以作为 OpenClaw 插件使用，提供 AI Tool 和斜杠命令。

### 安装插件

在 OpenClaw 配置文件中添加插件：

```json
{
  "plugins": [
    {
      "path": "/path/to/clateslaw",
      "config": {
        "grafanaUrl": "https://grafana.example.com",
        "grafanaToken": "your-grafana-api-token",
        "defaultCarId": 1
      }
    }
  ]
}
```

### 配置说明

| 配置项 | 必填 | 说明 |
|--------|------|------|
| `grafanaUrl` | 是 | Grafana 服务器 URL |
| `grafanaToken` | 是 | Grafana API Token |
| `defaultCarId` | 否 | 默认车辆 ID，默认为 1 |

### 使用方式

#### 斜杠命令

```
/tesla                    # 显示帮助
/tesla drives             # 查询行程记录
/tesla charges            # 查询充电记录
/tesla battery            # 查询电池健康
/tesla 充电记录            # 支持中文关键词
/tesla {"version":"1.0","type":"drives","timeRange":{"semantic":"last_7_days"}}
```

支持的关键词：

| 英文 | 中文 | 查询类型 |
|------|------|----------|
| cars | 车辆 | 车辆列表 |
| car | 概览 | 车辆概览 |
| drives | 行程 | 行程记录 |
| charges | 充电 | 充电记录 |
| battery | 电池 | 电池健康 |
| efficiency | 能耗/效率 | 能耗效率 |
| states | 状态 | 状态历史 |
| updates | 更新 | 更新历史 |
| mileage | 里程 | 里程统计 |
| vampire | 静置/耗电 | 静置耗电 |
| locations | 位置 | 位置统计 |
| timeline | 时间线 | 时间线 |
| tpms | 胎压 | 胎压数据 |

#### AI Tool

AI 可以调用 `tesla_query` 工具执行结构化查询：

```json
{
  "query": "{\"version\":\"1.0\",\"type\":\"drives\",\"timeRange\":{\"semantic\":\"last_7_days\"}}"
}
```

支持的查询类型：
- `cars` - 车辆列表
- `car` - 车辆概览
- `drives` - 行程记录
- `charges` - 充电记录
- `battery` - 电池健康
- `efficiency` - 能耗效率
- `states` - 状态历史
- `updates` - 更新历史
- `mileage` - 里程统计
- `vampire` - 静置耗电
- `locations` - 位置统计
- `locations.charging` - 充电站统计
- `timeline` - 时间线
- `visited` - 访问地点
- `projected-range` - 预估续航
- `stats.charging` - 充电统计
- `stats.driving` - 驾驶统计
- `stats.period` - 周期统计
- `tpms` - 胎压数据
- `detail.drive` - 行程详情（需要 recordId）
- `detail.charge` - 充电详情（需要 recordId）

## 快速查询当前位置（最新定位点）

新增命令：`tesla where <car-id>`

- 经纬度（JSON）：
  - `tesla where 1 -o json`
- 经纬度 + 高德逆地理地址：
  - `tesla where 1 --amap`

### 发送静态地图到 Telegram（Media）

如果你想把“当前坐标”的高德静态地图发到 Telegram，可以用 OpenClaw CLI：

```bash
openclaw message send \
  --channel telegram \
  --target <你的telegram-id> \
  --media /absolute/path/to/amap-static.png \
  --message "高德静态地图（最新坐标点）"
```

> 说明：这里的 `--media` 支持本地文件路径（图片/视频等）。

## MQTT 服务

MQTT 服务订阅 TeslaMate 的 MQTT 消息，实现车辆状态变化的实时推送通知。

### 核心事件

| 事件 | 触发条件 | 动作 |
|------|----------|------|
| 软件更新 | `update_available=true` + `update_version` | 推送更新通知（4小时间隔） |
| 行程结束 | `driving → 非driving` | 截图 + 周边推荐 + 记录停车起点 |
| 开始充电 | `非Charging → Charging` | 记录充电起点 |
| 充电结束 | `Charging → Complete/Disconnected` | 推送充电增益 + 截图 |
| 开始驾驶 | `非driving → driving` | 推送停车待机变化（不含充电增益） |

### 差值计算逻辑

**场景示例：驾驶 → 停车 → 充电 → 停车 → 驾驶**

1. `driving → online`: 记录停车起点 300km/70%
2. `Charging`: 记录充电起点 300km/70%
3. `Complete`: 推送充电增益 +120km/+25%，更新停车起点为 420km/95%
4. 停车待机，续航降到 418km/94%
5. `online → driving`: 推送待机变化 -2km/-1%（只计算充电后的损耗）

### 测试脚本

使用 `scripts/mqtt-test.sh` 快速模拟各种状态变化：

```bash
# 查看帮助
./scripts/mqtt-test.sh

# 模拟完整行程周期 (driving -> online)
./scripts/mqtt-test.sh drive-cycle

# 模拟充电周期 (Charging -> Complete)
./scripts/mqtt-test.sh charge-cycle

# 模拟完整周期 (驾驶->停车->充电->驾驶)
./scripts/mqtt-test.sh full-cycle

# 模拟软件更新通知
./scripts/mqtt-test.sh update

# 单独设置续航值
./scripts/mqtt-test.sh range 350 80

# 单独设置车辆状态
./scripts/mqtt-test.sh state online

# 单独设置充电状态
./scripts/mqtt-test.sh charging Charging
```

本地配置（configstore）：

本项目不再依赖 `.env` / `dotenv`。所有运行时配置都存储在本机的 configstore JSON 文件中（不会进 git）。

常用命令：

```bash
# 查看配置文件路径
node scripts/bootstrap-configstore-from-env.mjs --help 2>/dev/null || true
node -e 'console.log((new (require("configstore"))("tesla-service")).path)' 2>/dev/null || true

# 交互式初始化（推荐）
tesla config init

# 查看当前配置（token 会打码）
tesla config get

# 检查必填项是否齐全
tesla config doctor
```

配置项（逻辑结构）：

- `mqtt.host` (默认: localhost)
- `mqtt.port` (默认: 1883)
- `mqtt.carId` (默认: 1)
- `mqtt.topicPrefix` (默认: teslamate)
- `grafana.url` (必填)
- `grafana.token` (必填)
- `openclaw.channel` (必填)
- `openclaw.target` (必填)
- `openclaw.account` (可选)

### 手动 MQTT 模拟（mosquitto_pub）

如果你需要在不实际开车/不等真实车辆事件的情况下模拟 TeslaMate 的 MQTT 事件，可以用 `mosquitto_pub` 发布消息。

### 1) 模拟停车->驾驶推送

常用模拟命令：

```bash
# 1) 可选：先写入续航/电量（让推送里有数字）
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/rated_battery_range_km -m "300"
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/usable_battery_level -m "80"

# 2) 模拟开始驾驶（触发：非driving -> driving，会推送“🚗 开始驾驶/待机变化”）
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/state -m "driving"

# 3) 模拟结束驾驶/进入停车（触发：driving -> 非driving，会在 30s 后执行并推送 drive 截图）
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/state -m "online"

# 4) 典型测试流程（从停车到开始驾驶，再到结束驾驶截图）
# - 先确保当前不是 driving（例如 online）
# - 推送开始驾驶（driving）
# - 再推送结束驾驶（online），等待 30 秒看截图
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/state -m "online"
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/state -m "driving"
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/state -m "online"
```

注意：停车->驾驶推送的“最小 1 小时间隔”是对“推送频率”的节流（距离上次推送 >= 1h 才允许再次推送），
不是对“停车时长”的限制；停车时长 29 分钟也可能推送（只要距离上次推送已超过 1 小时，且续航/电量有变化）。

### 2) 模拟软件更新推送

更新推送触发条件（代码逻辑）：

- 需要同时满足：
  - `update_available = true`
  - `update_version` 为非空字符串
- 会立即推送一次，然后 4 小时内（`UPDATE_NOTIFY_INTERVAL_MS`）重复事件会被跳过（避免刷屏）

模拟命令（建议先发 version 再发 available）：

```bash
# 1) 触发一次“更新可用”推送（确保 update_version 非空）
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/update_version -m "2099.99.1"
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/update_available -m "true"

# 2) 测试完成后：回退/清理测试状态（避免污染持久化 mqtt-state.json）
# - 把 update_available 置回 false
# - 把 update_version 置空
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/update_available -m "false"
mosquitto_pub -h 192.168.31.56 -p 1883 -t teslamate/cars/1/update_version -m ""
```

如果发现触发后没有推送，优先看 `pm2 logs tesla-mqtt` 是否出现：

- `更新版本: ... -> ...`
- `更新可用状态: false -> true`
- `更新通知已发送`（或 `更新通知在 4 小时间隔内，跳过`）

## 功能特性

- 🚗 车辆信息查询
- 🔋 电池健康状态分析
- ⚡ 充电记录查询
- 🛣️ 驾驶记录查询
- 📊 能效分析
- 📍 位置统计
- 🧛 待机能耗分析
- 📈 里程统计
- 🔄 软件更新历史
- 📅 活动时间线
- 🛞 胎压监测 (TPMS)
- 📸 可视化截图（日报/周报/月报/年报）

## 环境要求

- Node.js >= 18
- pnpm
- TeslaMate + Grafana 实例

## 安装

```bash
# 克隆项目
git clone <repository-url>
cd tesla-service

# 安装依赖
pnpm install

# 初始化本地配置（configstore）
tesla config init
```

### 全局安装

将 CLI 注册为全局命令 `tesla`，可在任意目录使用：

```bash
# 构建 CLI
pnpm build:cli

# 全局链接
pnpm link --global

# 验证安装
tesla --help
```

取消全局链接：

```bash
pnpm unlink --global
```

## 配置

本项目使用 configstore 存储本地配置，不再使用 `.env`。

```bash
# 交互式初始化（会写入本机 configstore JSON 文件）
tesla config init

# 查看配置文件路径
tesla config path

# 查看当前配置（敏感字段会打码）
tesla config get
```

## 使用方法

### CLI 命令

```bash
# 开发模式运行
pnpm dev <command>

# 或构建后运行
pnpm build
tesla <command>
```

### 可用命令

| 命令 | 描述 |
|------|------|
| `cars` | 列出所有车辆 |
| `car <id>` | 查看车辆概览 |
| `charges <car-id>` | 查看充电记录 |
| `drives <car-id>` | 查看驾驶记录 |
| `battery <car-id>` | 电池健康状态 |
| `efficiency <car-id>` | 能效分析 |
| `states <car-id>` | 车辆状态历史 |
| `updates <car-id>` | 软件更新历史 |
| `mileage <car-id>` | 里程统计 |
| `vampire <car-id>` | 待机能耗分析 |
| `locations <car-id>` | 位置统计 |
| `timeline <car-id>` | 活动时间线 |
| `visited <car-id>` | 访问地点 |
| `projected-range <car-id>` | 预计续航分析 |
| `tpms <car-id>` | 胎压监测 (TPMS) |
| `stats charging <car-id>` | 充电统计 |
| `stats driving <car-id>` | 驾驶统计 |
| `stats period <car-id>` | 周期统计 |
| `query <json>` | 执行 TeslaQuery 协议查询 |
| `screenshot query <json>` | 从 TeslaQuery 生成截图 |
| `screenshot drive [id]` | 行程截图 |
| `screenshot charge [id]` | 充电截图 |
| `screenshot daily [date]` | 日报截图 |
| `screenshot weekly [date]` | 周报截图 |
| `screenshot monthly [date]` | 月报截图 |
| `screenshot yearly [year]` | 年报截图 |

### 通用选项

- `-o, --output <format>` - 输出格式: `table` | `json` (默认: table)
- `-f, --from <date>` - 开始时间 (如: `now-30d`)
- `-t, --to <date>` - 结束时间 (如: `now`)
- `-l, --limit <number>` - 记录数量限制

### 示例

```bash
# 列出所有车辆
pnpm dev cars

# 查看车辆 1 的电池状态
pnpm dev battery 1

# 查看最近 30 天的充电记录 (JSON 格式)
pnpm dev charges 1 -f now-30d -o json

# 查看驾驶统计
pnpm dev stats driving 1
```

### TeslaQuery 协议

支持通过 JSON 协议执行结构化查询，主要用于 AI/Skill 集成：

```bash
# 查询最近的行程并截图发送
tesla screenshot query '{"version":"1.0","type":"drives","pagination":{"limit":1}}' --send

# 查询指定行程详情
tesla screenshot query '{"version":"1.0","type":"detail.drive","recordId":4275}' --send

# 生成今日日报
tesla screenshot query '{"version":"1.0","type":"screenshot","screenshot":{"type":"daily"}}' --send

# 纯数据查询（不截图）
tesla query '{"version":"1.0","type":"stats.driving","timeRange":{"semantic":"this_week"}}'

# 从文件读取查询
tesla screenshot query ./query.json --send
```

详细协议定义见 [`skills/tesla/references/query-protocol.md`](./skills/tesla/references/query-protocol.md)

## 数据采集

将 API 数据采集到本地 JSON 文件：

```bash
pnpm collect
```

数据将保存到 `data/` 目录，结构如下：

```
data/
├── _metadata.json          # 采集元数据
├── settings/
│   └── settings.json
└── cars/
    ├── cars.json
    └── car-1/
        ├── overview.json
        ├── battery/
        ├── charges/
        │   ├── records.json
        │   └── curves/       # 充电曲线数据
        ├── drives/
        │   ├── records.json
        │   └── positions/    # GPS 轨迹数据
        ├── efficiency/
        ├── states/
        ├── updates/
        ├── mileage/
        ├── vampire/
        ├── locations/
        ├── timeline/
        ├── projected-range/
        ├── tpms/             # 胎压监测数据
        │   ├── latest.json
        │   └── stats.json
        └── stats/
```

## 测试

项目包含数据验证测试，用于检测 API 异常数据：

```bash
# 运行所有测试
pnpm test

# 运行测试一次
pnpm test:run

# 运行单个测试文件
pnpm test tests/battery.test.ts
```

### 测试覆盖

- 元数据验证
- 设置验证
- 车辆数据验证
- 电池数据验证
- 充电记录验证
- 充电曲线验证
- 驾驶记录验证
- GPS 轨迹验证
- 能效数据验证
- 位置数据验证
- 里程数据验证
- 预计续航验证
- 状态数据验证
- 统计数据验证
- 时间线验证
- 软件更新验证
- 待机能耗验证
- 胎压监测验证 (TPMS)

## 项目结构

```
tesla-service/
├── src/
│   ├── cli/           # CLI 命令
│   ├── core/          # 核心服务和查询
│   ├── config/        # 配置
│   ├── types/         # TypeScript 类型定义
│   └── web/           # Web 可视化组件
│       ├── components/  # UI 组件
│       ├── pages/       # 页面组件
│       ├── hooks/       # React Hooks
│       └── demo/        # Demo 数据
├── scripts/
│   └── collect-data.ts  # 数据采集脚本
├── tests/
│   ├── helpers/       # 测试辅助工具
│   └── *.test.ts      # 测试文件
├── data/              # 采集的数据 (gitignore)
└── dist/              # 构建输出
```

## 开发

```bash
# 开发模式
pnpm dev

# 构建
pnpm build

# 运行测试
pnpm test
```

### Mock 数据开发

截图命令支持 `--mock` 参数，使用预设的 Mock 数据进行开发，无需连接 Grafana：

```bash
# 使用 Mock 数据截图单次驾驶
pnpm dev screenshot drive --mock

# 使用 Mock 数据截图充电记录
pnpm dev screenshot charge --mock

# 使用 Mock 数据截图每日汇总
pnpm dev screenshot daily --mock
```

Mock 数据定义在 `src/cli/commands/screenshot-mock.ts`，可自行修改测试数据。

### Demo 数据

Web 端在开发模式下可使用 Demo 数据，无需真实的 TeslaMate 后端。Demo 数据位于 `src/web/demo/` 目录：

| 文件 | 说明 |
|------|------|
| `home.ts` | 首页 Demo 数据 |
| `drive.ts` | 行程详情页 Demo 数据 |
| `charge.ts` | 充电详情页 Demo 数据 |
| `daily.ts` | 日报页面 Demo 数据（含行程、充电、轨迹、胎压） |

启动 Web 开发服务器：

```bash
pnpm dev:web
```

## License

MIT
