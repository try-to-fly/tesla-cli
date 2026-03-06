# Delivery & Screenshot Conventions

这份文档讲最后一层：**查到了之后，怎么展示、怎么发。**

OpenClaw 场景里，很多混乱不是出在“查不到”，而是出在“查到了以后该怎么呈现”。

## 三种输出目标

### 1. 只拿数据

适合：
- 还要继续分析
- 要做文字总结
- 想做比较 / 统计 / 解释

推荐：

```bash
tesla query '<TeslaQuery JSON>'
```

### 2. 生成截图但不立刻发送

适合：
- 先本地看图
- 调样式 / 验证截图效果
- 中间流程还要加工

推荐：

```bash
tesla screenshot query '<TeslaQuery JSON>'
```

或直接子命令：

```bash
tesla screenshot daily 2026-03-06 -c 1
```

### 3. 生成截图并发送

适合：
- 用户明确要“发一下”
- 自动通知场景
- MQTT 事件触发

推荐：

```bash
tesla screenshot query '<TeslaQuery JSON>' --send
```

或在 `screenshot.send = true` 的协议里表达发送语义。

## 什么内容适合截图

优先截图的场景：
- 最近一次行程
- 最近一次充电
- 行程详情 / 充电详情
- 日报 / 周报 / 月报 / 年报

原因很简单：
- 这些内容天然适合卡片式展示
- 用户更容易扫一眼看懂
- 更适合直接发到聊天里

## 什么内容不一定要截图

优先返回数据 / 文字总结：
- 电池健康
- 效率分析
- 统计问句
- 位置统计
- 待机损耗
- 更新历史

这些内容更适合：
- 结构化结果
- AI 先做总结
- 再按需决定要不要补图

## OpenClaw 发送时的注意点

### 1. 发送是“外部动作”

如果是主动发消息、发媒体，应该明确区分：
- 用户只是问数据
- 用户明确要发送

### 2. 不要把“发送”硬编码到所有截图请求里

截图 ≠ 必须发送。

更好的设计是：
- screenshot 是渲染能力
- send 是投递能力
- 两者可以组合，但不要绑定死

### 3. 工作区里已有本地媒体发送约定

在 OpenClaw 工作区 `TOOLS.md` 里，已经有 MEDIA 协议约定：
- 用 `MEDIA:<path-or-url>` 发送附件
- 本地路径最好放在 allowlist 安全目录中

这个约定更适合：
- agent 自己发本地文件
- 与 OpenClaw 消息发送能力配合

但 Tesla CLI 自己的 `--send` 更适合“查询产物直接出站”的一体化流程。

## 推荐决策规则

### 用户说“看看 / 给我看”

默认：
- 先生成截图
- 不一定自动发送到外部目标，视当前会话而定

### 用户说“发一下 / 发给我”

默认：
- 走截图 + 发送

### 用户说“统计一下 / 分析一下 / 为什么”

默认：
- 先拿结构化数据
- 由 AI 总结
- 不急着出图

## 实操模板

### 最近一次行程并发送

```bash
tesla screenshot query '{"version":"1.0","type":"drives","carId":1,"pagination":{"limit":1}}' --send
```

### 本周驾驶统计，仅查数据

```bash
tesla query '{"version":"1.0","type":"stats.driving","carId":1,"timeRange":{"semantic":"this_week"}}'
```

### 今天日报并发送

```bash
tesla screenshot query '{"version":"1.0","type":"screenshot","carId":1,"screenshot":{"type":"daily","send":true}}'
```

## 相关文档

- 总览：[`./overview.md`](./overview.md)
- 自然语言映射：[`./query-patterns.md`](./query-patterns.md)
- 查询协议：[`./query-protocol.md`](./query-protocol.md)
