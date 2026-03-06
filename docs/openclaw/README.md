# Tesla for OpenClaw

这组文档专门讲：**怎么让 OpenClaw 用好这个项目。**

不是讲仓库开发细节，也不是完整 API 参考；重点是从 OpenClaw 视角，把“会怎么问、该怎么查、什么时候出图、怎么发出去”讲清楚。

## 适合谁看

- 在写 Tesla skill / prompt / agent 约定的人
- 想让 OpenClaw 用自然语言查 Tesla 数据的人
- 想让 OpenClaw 自动发截图、报表、查询结果的人
- 后续要维护 `skills/tesla/SKILL.md`、`TOOLS.md` 或插件行为的人

## 建议阅读顺序

### 1. 先知道能做什么
- [`./overview.md`](./overview.md)

### 2. 再知道自然语言怎么映射
- [`./query-patterns.md`](./query-patterns.md)

### 3. 再看结构化查询协议
- [`./query-protocol.md`](./query-protocol.md)

### 4. 最后看发送 / 截图约定
- [`./delivery-and-screenshots.md`](./delivery-and-screenshots.md)

## 这套文档解决什么问题

过去关于 Tesla 的说明散在几处：
- 仓库 README
- `skills/tesla/SKILL.md`
- 工作区 `TOOLS.md`
- OpenClaw 插件实现

信息本身没错，但很容易出现：
- 使用约定和代码实现慢慢漂移
- 会查，但不会发
- 会发，但不知道什么时候该走截图
- skill 里塞太多细节，后期难维护

所以这里单独抽一层“OpenClaw 使用文档”：
- 给 agent / skill 设计者看
- 也给后续整理 prompt / slash command / tool 行为的人看

## 一句话原则

从 OpenClaw 视角，Tesla 能力最好分成 3 层：
1. **意图层**：用户在说什么
2. **查询层**：转换成 `TeslaQuery`
3. **呈现层**：返回 JSON、文字摘要，还是截图并发送

别把这 3 层混写在一页里，不然很快就会乱。
