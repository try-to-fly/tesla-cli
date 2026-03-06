# OpenClaw Plugin

这份文档只讲本仓库如何作为 OpenClaw 插件接入。

## 提供了什么

项目暴露 2 个主要入口：
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

当前实现是“轻量关键词映射”，不是完整自然语言理解。

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
- 内部会先做 JSON.parse
- 只接受 `version: "1.0"`
- `type` 必须是受支持的查询类型

## 查询执行链路

插件层本身比较薄：
- command / tool 负责解析输入
- 默认 carId 补全
- 最终都走 `executeQuery()`

这设计是对的：
- 外部接入面薄
- 核心逻辑不重复
- CLI / 插件 / 其他入口更容易保持一致

## 适合继续改进的方向

- `/tesla` 的关键词映射可以再扩展，但别把它做成一坨 if/else
- 更好的做法是把“自然语言 -> QueryType”抽成独立模块
- tool / command 的错误信息可以更统一
- 插件配置和 CLI configstore 之间的边界，最好在文档里一直保持清楚
