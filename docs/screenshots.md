# Screenshots & Visualization

这份文档说明项目中的截图与可视化能力。

## 作用

项目内置了一套基于 Vite + React 的渲染层，用来把 Tesla 数据生成图片，例如：
- 行程轨迹图
- 充电曲线图
- 日报 / 周报 / 月报 / 年报页面

对应代码主要在：
- `src/web/*`
- `src/cli/commands/screenshot.ts`
- `src/core/utils/browser-pool.ts`

## 典型用途

- 生成更适合消息发送的卡片图
- 发送给 OpenClaw 或其他消息渠道
- 本地调试页面样式与数据展示

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
- `src/web/styles/*`：全局样式与主题样式

## 修改这部分时的建议

- CLI 层负责参数解析，不要堆太多业务逻辑
- 页面层尽量只负责展示
- 数据转换优先收口在 `core` 或 `hooks`
- 如果改了截图链路，建议至少跑一遍：

```bash
pnpm dev screenshot drive -o /tmp/drive-latest.png
```

## 回归建议

截图相关改动后，至少确认：
- 图片能正常生成
- 文件不是 0 字节
- 关键文案和数值没有错位
- 深色 / 浅色主题（如果有）显示正常

更完整的检查见：[`./REGRESSION-CHECKLIST.md`](./REGRESSION-CHECKLIST.md)
