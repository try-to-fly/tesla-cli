# Screenshots & Visualization

这份文档讲项目里的“出图”能力。

## 这部分是干嘛的

仓库里有一套基于 Vite + React 的渲染层，用来把 Tesla 数据做成：
- 行程图
- 充电图
- 各类日报 / 周报 / 月报 / 年报页面

对应代码主要在：
- `src/web/*`
- `src/cli/commands/screenshot.ts`
- `src/core/utils/browser-pool.ts`

## 典型用途

- 把数据做成更适合发消息的卡片图
- 给 OpenClaw / Telegram 发送图片
- 本地调 UI 样式

## 常见命令

### 生成行程截图

```bash
tesla screenshot drive --record-id 4275 -o /tmp/drive.png
```

### 生成充电截图

```bash
tesla screenshot charge --record-id 801 -o /tmp/charge.png
```

### 开发 Web 页面

```bash
pnpm dev:web
```

## 代码结构

- `src/web/pages/*`：不同页面
- `src/web/demo/*`：本地 demo 数据
- `src/web/hooks/*`：数据与主题相关 hook
- `src/web/styles/*`：全局样式 / 主题样式

## 改这块时要注意

- CLI 层负责参数解析，不要把太多业务堆进去
- 页面层尽量只关心展示
- 数据转换优先收口在 `core` 或 `hooks`
- 如果改了截图链路，最好跑一遍：

```bash
pnpm dev screenshot drive -o /tmp/drive-latest.png
```

## 回归建议

截图相关改动后，至少确认：
- 图片能生成
- 不是 0 字节
- 关键文案 / 数值没有错位
- 深色/浅色主题（如果有）没炸

更完整检查见：[`./REGRESSION-CHECKLIST.md`](./REGRESSION-CHECKLIST.md)
