# OpenClaw Usage Overview

这份文档概览 OpenClaw 如何使用 Tesla CLI 的查询、截图与发送能力。

## 能力分层

### 1. 纯数据查询

适合：
- “这周开了多少公里”
- “本月充电统计”
- “电池健康怎么样”
- “最近 7 天的效率”

典型执行：

```bash
tesla query '{"version":"1.0","type":"stats.driving","carId":1,"timeRange":{"semantic":"this_week"}}'
```

特点：
- 返回 JSON / 结构化结果
- 适合让 AI 继续总结、比较、解释
- 不一定要发图片

### 2. 截图生成

适合：
- “给我看最近一次行程”
- “发一下上次充电”
- “看看今天日报”
- “发周报 / 月报 / 年报”

典型执行：

```bash
tesla screenshot query '{"version":"1.0","type":"drives","carId":1,"pagination":{"limit":1}}'
```

或：

```bash
tesla screenshot daily 2026-03-06 -c 1
```

特点：
- 更适合“看图说话”
- 更适合直接发到聊天软件
- 适合最近一次行程 / 充电 / 汇总类内容

### 3. 截图 + 发送

适合：
- 用户明确说“发一下”
- 需要通过 OpenClaw 发到 Telegram / 当前会话 / 其他目标
- MQTT 或自动化场景里需要直接出站

典型执行：

```bash
tesla screenshot query '{"version":"1.0","type":"screenshot","carId":1,"screenshot":{"type":"weekly","send":true}}'
```

或：

```bash
tesla screenshot weekly 2026-03-06 -c 1 --send
```

## OpenClaw 场景下的推荐原则

### 什么情况优先走 `query`

- 用户问的是“数值 / 统计 / 对比 / 解释”
- 结果还需要 AI 二次组织
- 不需要视觉呈现

例如：
- 电池健康
- 充电效率
- 本周/本月驾驶统计
- 常去地点 / 充电站分析

### 什么情况优先走 `screenshot`

- 用户想“看看”而不是“算算”
- 内容本来就适合图卡形式
- 是日报 / 周报 / 月报 / 年报 / 详情页
- 最近一次行程 / 最近一次充电要快速展示

### 什么情况需要 `--send`

- 用户明确说“发一下 / 发给我 / 直接发图”
- 是通知 / 自动化 / 被动触发场景
- 不是只在终端本地看结果

## 与 OpenClaw 的几个接入面

### 1. Skill 层

`skills/tesla/SKILL.md` 负责把自然语言意图映射成命令策略。

### 2. 插件层

仓库的 OpenClaw 插件提供：
- `/tesla` command
- `tesla_query` tool

### 3. 本地工具说明

工作区 `TOOLS.md` 记录本机可用命令、常用示例和本地环境注意事项。

## 推荐的信息流

```text
用户自然语言
  ↓
判断：查数据 / 出图 / 直接发送
  ↓
构造 TeslaQuery
  ↓
执行 tesla query / tesla screenshot ...
  ↓
OpenClaw 总结结果或发送图片
```

## 下一步

- 看自然语言怎么映射：[`./query-patterns.md`](./query-patterns.md)
- 看协议字段怎么写：[`./query-protocol.md`](./query-protocol.md)
- 看发送和截图约定：[`./delivery-and-screenshots.md`](./delivery-and-screenshots.md)
