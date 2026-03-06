# CLI Guide

这份文档聚焦 `tesla` 命令怎么用。

## 命令分组

### 基础查询

- `tesla cars`
- `tesla car <id>`
- `tesla drives <car-id>`
- `tesla charges <car-id>`
- `tesla battery <car-id>`
- `tesla efficiency <car-id>`
- `tesla mileage <car-id>`
- `tesla projected-range <car-id>`
- `tesla tpms <car-id>`

### 历史与位置

- `tesla states <car-id>`
- `tesla updates <car-id>`
- `tesla locations <car-id>`
- `tesla visited <car-id>`
- `tesla timeline <car-id>`
- `tesla where <car-id>`
- `tesla vampire <car-id>`

### 统计与详情

- `tesla stats charging <car-id>`
- `tesla stats driving <car-id>`
- `tesla stats period <car-id>`
- `tesla detail drive <record-id>`
- `tesla detail charge <record-id>`

### 工具型命令

- `tesla query <json>`
- `tesla screenshot ...`
- `tesla mqtt ...`
- `tesla config ...`
- `tesla notify ...`
- `tesla nav ...`

## 常用例子

### 看车辆列表

```bash
tesla cars -o json
```

### 看最近 5 条行程

```bash
tesla drives 1 -l 5
```

### 看最近 30 天充电记录

```bash
tesla charges 1 --from now-30d --to now
```

### 看电池健康

```bash
tesla battery 1 -o json
```

### 看当前位置

```bash
tesla where 1 -o json
```

带高德逆地理：

```bash
tesla where 1 --amap
```

### 用统一 JSON 协议查询

```bash
tesla query '{"version":"1.0","type":"drives","carId":1,"timeRange":{"semantic":"last_7_days"}}'
```

这是最稳定的程序化入口；CLI 子命令和 OpenClaw tool 本质上都能收敛到这套协议。

## 输出格式

大部分命令支持：
- `-o table`
- `-o json`

默认通常是 `table`，脚本集成建议直接用 `json`。

## 时间范围

很多命令支持：
- `--from`
- `--to`

常见值：
- `now`
- `now-7d`
- `now-30d`
- `now-1y`

## 建议的阅读顺序

如果你要改 CLI：
1. `src/cli/index.ts`
2. `src/cli/commands/*`
3. `src/core/query-executor.ts`
4. 对应 `src/core/services/*`

## 深入参考

字段定义、查询类型、协议细节：
- [`./API-REFERENCE.md`](./API-REFERENCE.md)
