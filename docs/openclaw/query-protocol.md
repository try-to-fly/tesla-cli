# TeslaQuery Protocol for OpenClaw

这份文档讲结构化查询协议本身，也就是 OpenClaw 最终应该构造什么 JSON。

## 最小结构

```json
{
  "version": "1.0",
  "type": "drives"
}
```

最低要求：
- `version` 必须是 `"1.0"`
- `type` 必须是支持的查询类型

## 常用字段

### `carId`

```json
{
  "version": "1.0",
  "type": "battery",
  "carId": 1
}
```

- 不传时，很多 OpenClaw 场景会回落到默认车 ID
- 但在可控脚本 / 自动化里，建议显式写出

### `timeRange`

```json
{
  "version": "1.0",
  "type": "stats.driving",
  "carId": 1,
  "timeRange": {
    "semantic": "this_week"
  }
}
```

支持：
- `semantic`
- `relative`
- `absolute`

OpenClaw 场景里最常用的是 `semantic`。

### `pagination`

```json
{
  "version": "1.0",
  "type": "drives",
  "carId": 1,
  "pagination": {
    "limit": 1
  }
}
```

常见用途：
- 最近一条行程
- 最近一条充电
- 限制返回条数，避免结果太大

### `recordId`

```json
{
  "version": "1.0",
  "type": "detail.drive",
  "carId": 1,
  "recordId": 4275
}
```

用于：
- `detail.drive`
- `detail.charge`

### `screenshot`

```json
{
  "version": "1.0",
  "type": "screenshot",
  "carId": 1,
  "screenshot": {
    "type": "weekly",
    "date": "2026-03-06",
    "send": true
  }
}
```

字段：
- `type`: `drive | charge | daily | weekly | monthly | yearly`
- `id`: 用于具体记录截图
- `date`: 用于日报/周报/月报/年报定位日期
- `send`: 是否直接发送

## 支持的主要 `type`

### 列表 / 基础查询
- `cars`
- `car`
- `drives`
- `charges`
- `states`
- `updates`
- `locations`
- `visited`
- `timeline`

### 分析 / 统计
- `battery`
- `efficiency`
- `mileage`
- `vampire`
- `projected-range`
- `stats.charging`
- `stats.driving`
- `stats.period`
- `tpms`
- `locations.charging`

### 详情
- `detail.drive`
- `detail.charge`

### 截图
- `screenshot`

## OpenClaw 最常用的几个协议模板

### 最近一次行程（用于出图）

```json
{
  "version": "1.0",
  "type": "drives",
  "carId": 1,
  "pagination": { "limit": 1 }
}
```

### 最近一次充电（用于出图）

```json
{
  "version": "1.0",
  "type": "charges",
  "carId": 1,
  "pagination": { "limit": 1 }
}
```

### 本周驾驶统计（用于问答）

```json
{
  "version": "1.0",
  "type": "stats.driving",
  "carId": 1,
  "timeRange": { "semantic": "this_week" }
}
```

### 今天日报（用于截图）

```json
{
  "version": "1.0",
  "type": "screenshot",
  "carId": 1,
  "screenshot": { "type": "daily" }
}
```

### 指定行程详情

```json
{
  "version": "1.0",
  "type": "detail.drive",
  "carId": 1,
  "recordId": 4275
}
```

## CLI 对应关系

协议最终可以映射成 CLI 命令。

例如：
- `stats.driving` → `tesla stats driving <car-id>`
- `detail.drive` → `tesla detail drive <record-id>`
- `screenshot` → `tesla screenshot ...`

代码入口：
- `src/core/query-command.ts`
- `src/core/query-executor.ts`

## 什么时候看更细的字段文档

如果你关心的是：
- 返回 JSON 长什么样
- 每个字段语义是什么
- Grafana 仪表板与查询怎么对应

去看：[`../API-REFERENCE.md`](../API-REFERENCE.md)
