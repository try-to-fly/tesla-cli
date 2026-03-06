# MQTT Service

这份文档讲实时事件监听服务，而不是通用 CLI 查询。

## 它做什么

项目会订阅 TeslaMate 的 MQTT 主题，然后在关键状态变化时触发动作，比如：
- 行程结束后截图 / 推送
- 充电开始时记录起点
- 充电结束时计算增益并推送
- 软件更新可用时发送通知
- 再次开车时计算停车待机损耗

相关代码：
- `src/cli/commands/mqtt.ts`
- `src/core/services/mqtt-service.ts`

## 启动方式

```bash
tesla mqtt listen
```

也可以覆盖配置：

```bash
tesla mqtt listen --host 127.0.0.1 --port 1883 --car-id 1
```

## 依赖配置

至少需要：
- `mqtt.host`
- `mqtt.port`
- `mqtt.carId`
- `mqtt.topicPrefix`
- Grafana 相关配置（因为很多事件最终会查数 / 出图）
- OpenClaw 发送目标配置（如果你启用了真实推送）

## 事件模型（高层）

### 软件更新

触发条件：
- `update_available=true`
- 且有 `update_version`

动作：
- 推送更新通知
- 带节流，避免频繁重复推送

### 行程结束

典型状态：
- `driving -> 非 driving`

动作：
- 生成行程截图
- 可附带周边推荐 / 停车点上下文
- 记录停车起点，为后续待机损耗做基线

### 充电开始 / 结束

开始：
- 记录充电起点续航 / 电量

结束：
- 计算 `+km / +SOC`
- 更新停车基线，避免把充电增益和停车损耗混在一起

## 调试与模拟

项目自带测试子命令 / 脚本。

### 快速模拟完整周期

```bash
./scripts/mqtt-test.sh full-cycle
```

### 只模拟行程结束

```bash
./scripts/mqtt-test.sh drive-cycle
```

### 只模拟充电

```bash
./scripts/mqtt-test.sh charge-cycle
```

### 模拟软件更新

```bash
./scripts/mqtt-test.sh update
```

### 用 CLI test 能力（如果你在调命令层）

见：`tesla mqtt --help`

## 生产运行建议

通常会配合 pm2：

```bash
pm2 restart ecosystem.config.cjs --only tesla-mqtt
pm2 status tesla-mqtt
pm2 logs tesla-mqtt --lines 80 --nostream
```

## 排障优先级

如果 MQTT 不工作，按这个顺序查：
1. 进程有没有起来
2. MQTT broker 能不能连
3. topicPrefix / carId 对不对
4. Grafana 查询是否正常
5. 发送链路是否正常
6. `dist/` 是否是最新构建

完整排障清单：[`./REGRESSION-CHECKLIST.md`](./REGRESSION-CHECKLIST.md)
