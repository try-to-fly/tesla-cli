# Tesla for OpenClaw

这组文档说明如何把 Tesla CLI 接入 OpenClaw，并在聊天场景中稳定使用。

重点包括：
- 自然语言查询如何映射到 Tesla 查询能力
- 什么场景适合返回数据，什么场景适合生成截图
- 怎样通过 OpenClaw 发送查询结果、截图和自动通知

## 适合谁看

- 维护 OpenClaw Tesla 集成的人
- 需要通过自然语言查询 Tesla 数据的人
- 需要配置自动通知、截图发送或查询流程的人
- 维护相关 skill、工具配置或插件行为的人

## 建议阅读顺序

1. 能力概览：[`./overview.md`](./overview.md)
2. 查询映射：[`./query-patterns.md`](./query-patterns.md)
3. 查询协议：[`./query-protocol.md`](./query-protocol.md)
4. 发送与截图：[`./delivery-and-screenshots.md`](./delivery-and-screenshots.md)

## 这一组文档覆盖什么

关于 Tesla 与 OpenClaw 的说明涉及多个位置，例如：
- 仓库 README
- Tesla skill
- 本地工具说明
- OpenClaw 插件实现

这组文档的目标是把 OpenClaw 侧的使用方式集中整理，便于统一维护与查阅。

## 一个简单原则

从 OpenClaw 视角，可以把 Tesla 能力理解成 3 层：
1. **意图层**：用户想查什么
2. **查询层**：转换成 `TeslaQuery`
3. **呈现层**：返回结构化结果、文字摘要，或截图并发送

这样可以让查询、展示和发送逻辑保持清晰分离。
