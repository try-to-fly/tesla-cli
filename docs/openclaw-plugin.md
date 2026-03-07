# OpenClaw Plugin

这份文档说明本仓库如何作为 OpenClaw 插件接入。

## 提供的能力

项目暴露两个主要入口：
- `/tesla` command
- `tesla_query` tool

对应代码：
- `src/plugin/index.ts`
- `src/plugin/command.ts`
- `src/plugin/tool.ts`
- `openclaw.plugin.json`

## 插件配置

当前插件配置项定义在 `openclaw.plugin.json`：
- `grafanaUrl`（必填）
- `grafanaToken`（必填）
- `defaultCarId`（可选，默认 1）

示例：

```json
{
  "plugins": [
    {
      "path": "/path/to/tesla-service",
      "config": {
        "grafanaUrl": "https://grafana.example.com",
        "grafanaToken": "your-grafana-api-token",
        "defaultCarId": 1
      }
    }
  ]
}
```

## `/tesla` command

支持两种输入方式：

### 1. 简单关键词 / 自然语言

例如：
- `/tesla drives`
- `/tesla 充电记录`
- `/tesla 电池`

当前实现是轻量关键词映射，不是完整自然语言理解。

### 2. 直接传 JSON 协议

```text
/tesla {"version":"1.0","type":"battery"}
```

如果没有显式传 `carId`，会回落到 `defaultCarId`。

## `tesla_query` tool

tool 输入格式：

```json
{
  "query": "{\"version\":\"1.0\",\"type\":\"drives\",\"carId\":1}"
}
```

要点：
- `query` 是字符串，不是对象
- 内部会先做 `JSON.parse`
- 只接受 `version: "1.0"`
- `type` 必须是受支持的查询类型

## 查询执行链路

插件层本身比较薄，主要负责：
- 解析 command / tool 输入
- 补全默认 `carId`
- 最终调用 `executeQuery()`

这样可以让 CLI、插件和其他入口尽量保持一致。

## 后续改进方向

- 扩展 `/tesla` 的关键词映射
- 把“自然语言 -> QueryType”进一步抽成独立模块
- 统一 tool / command 的错误信息
- 持续明确插件配置与 CLI configstore 的边界
