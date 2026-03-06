# Natural Language → Query Patterns

这份文档描述 OpenClaw 在 Tesla 场景下，如何把自然语言请求映射成查询动作。

重点不是穷举句子，而是建立**稳定的判断模式**。

## 第一层判断：这是“查数据”还是“看图/发图”？

### 查数据

关键词特征：
- 多少
- 统计
- 分析
- 效率
- 健康
- 对比
- 里程
- 耗电

通常走：

```bash
tesla query '<TeslaQuery JSON>'
```

### 看图 / 发图

关键词特征：
- 看看
- 发一下
- 上一次
- 最近一次
- 日报 / 周报 / 月报 / 年报
- 详情

通常走：

```bash
tesla screenshot query '<TeslaQuery JSON>'
```

如果明确要发送，再加发送语义。

## 第二层判断：落到哪种 query type

### 车辆与概览

- “车辆信息” → `car`
- “所有车辆” → `cars`

### 行程与驾驶

- “最近的行程列表” → `drives`
- “这周开了多少公里” → `stats.driving`
- “查看行程 4275 详情” → `detail.drive`
- “看看最近一次行程” → `drives` + `pagination.limit=1` + screenshot

### 充电

- “最近充电记录” → `charges`
- “本月充电统计” → `stats.charging`
- “查看充电 801 详情” → `detail.charge`
- “发一下最近一次充电” → `charges` + `pagination.limit=1` + screenshot

### 电池 / 效率 / 续航

- “电池状态 / 健康 / 衰减” → `battery`
- “效率报告 / 能耗效率” → `efficiency`
- “预估续航” → `projected-range`

### 状态 / 更新 / 胎压

- “状态历史” → `states`
- “软件更新 / 固件版本” → `updates`
- “胎压 / TPMS” → `tpms`

### 位置 / 地点

- “常去地点 / 位置统计” → `locations`
- “充电站统计 / 充电站分析” → `locations.charging`
- “去过哪里” → `visited`
- “活动时间线” → `timeline`
- “车现在在哪” → `where`（这是 CLI 能力，和 QueryType 不完全同层）

### 停车损耗

- “待机耗电 / 吸血鬼耗电 / 停车耗电” → `vampire`

## 时间表达映射

常用语义时间：
- 今天 → `today`
- 昨天 → `yesterday`
- 本周 / 这周 → `this_week`
- 上周 → `last_week`
- 本月 → `this_month`
- 上月 → `last_month`
- 今年 → `this_year`
- 去年 → `last_year`
- 最近 3 天 → `last_3_days`
- 最近 7 天 → `last_7_days`
- 最近 30 天 → `last_30_days`
- 最近 90 天 → `last_90_days`
- 所有时间 → `all_time`

## 稳定策略，而不是死记例句

### 模式 A：最近一次 X

统一模式：
- type = 对应列表查询
- `pagination.limit = 1`
- 默认优先 screenshot

例子：
- 最近一次行程
- 最近一次充电

### 模式 B：X 详情 + 记录 ID

统一模式：
- 提取数字 ID
- `type = detail.drive | detail.charge`
- `recordId = 提取出的 ID`

### 模式 C：日报 / 周报 / 月报 / 年报

统一模式：
- `type = screenshot`
- `screenshot.type = daily | weekly | monthly | yearly`
- 如带明确日期，则补 `screenshot.date`

### 模式 D：统计问句

统一模式：
- 走 `stats.*` / `battery` / `efficiency` / `mileage` / `vampire`
- 默认不截图，先拿数据

## 推荐做法

### 推荐

- 先判断呈现方式，再判断 query type
- 把“最近一次”抽成统一规则
- 把“日报/周报/月报/年报”抽成统一 screenshot 规则
- 需要解释型回答时优先拿结构化数据

### 不推荐

- 每个自然语言句子都写一条硬编码规则
- 不区分“查数据”和“发图”
- 把 OpenClaw 发送逻辑混进 query type 判断里

## 相关文档

- 协议结构：[`./query-protocol.md`](./query-protocol.md)
- 发送与截图：[`./delivery-and-screenshots.md`](./delivery-and-screenshots.md)
