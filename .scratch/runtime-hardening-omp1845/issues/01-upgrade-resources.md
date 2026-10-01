# 01 固定 SDK 18.4.5 与随包资源一致性

Status: open
Blocked by: none

范围/授权见 [spec](../spec.md)，具体步骤见 [upgrade](../upgrade.md)。关联 D-02/D-03/D-21/D-28，补 G1 升级兼容与 M2 本地包，不改原生执行所有权。

## 目标与落点

coding-agent/utils 精确 18.4.5，官方原样依赖闭包，Bun 暂沿用 1.3.14。修改 package/lock、prepare-sdk、资源/环境校验及相应测试；保留用户 packageManager 修改。Host.mjs 只做必要新版 API 兼容，full 消息模式保留。

Main 负责资源切换时无活跃使用者；脚本拥有 staging/原子替换，失败保留旧完整资源；Host 不写用户配置或自动下载修复。生产与测试入口不得混用全局 CLI。

## 验收

- 先失败：已有旧包 link 时升级后实际 resolve 和 package metadata 必须为 18.4.5；manifest 声称新版而实际旧版会拒绝启动。
- 空目录准备、旧资源升级、连续两次准备、复制失败四种外部结果有意义地验证；不只比较打印的版本字符串。
- 官方 npm imports、两个消费前 hooks、真实 SDK stop/continue 与 ACK 后失败在隔离 provider 下通过；新版协议断言按原生含义调整。
- 旧录制回归、新 SDK 录制、平台/native addon/许可证与干净包资源身份明确；未启动真实账户调用。

本票完成不表示 02/03/04 功能已经完成，不开放冷写恢复；官方 API/打包失败按 upgrade 的停止条件记录具体限制。

## Comments

2026-10-01：审阅准备，未领取、未替换资源。
