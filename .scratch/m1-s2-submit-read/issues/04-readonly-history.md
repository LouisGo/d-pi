# 04 — 不启动 Agent 的受管理历史浏览

Status: open
Type: task
Stage: M1 S2
Blocked by: none
Labels: ready-for-agent

## 目标与依据

仅浏览项目时，可读取本 Thread 已绑定的原生历史；文件不可读、不完整或版本不支持时明确显示原因。独立 reader 及可复用阅读数据合同先交付，正式页面接入归 05。

受影响决定：D-21/22/24/26/35。共同依据：[S2 spec](../spec.md)、[确认方案](../acceptance-decision.md)、[固定版本证据](../evidence.md)、[基础契约](../../../docs/architecture/foundation-contracts.md)。授权与用户试用状态以 spec 为准；本轮只拆票，未开始实现。

## 交付与所有权

- 读取限定 Main 核准的受管理 nativeRef/configContext/source，防止任意路径读取；不启动 OMP、不加载扩展、不写回或迁移原生文件。
- 依据固定版本 loader/entry visitor 和真实格式选择受限只读解析；不直接把 Bun 模块当 Electron Node 可用，也不另搭 Runtime 探针。
- 有界字节读取/分页游标携带来源与 leaf/位置，处理不完整尾行、文件改变、缺失及不支持版本；取消查询释放文件资源。
- 区分持久历史和当前上下文，原生 busy 不等于空历史。App 冻结发送记录仍属独立收据，不伪装为原生历史。
- 本票不开放 CLI 历史导入执行，不建立跨 CLI 锁或进程重启后的执行恢复。

## 验收

功能和修复遵循 TDD，先目标失败测试、最小实现、再必要重构；既有正确行为补测不伪称历史红灯。实现前读取适用的 headless-features / TypeScript skill，GUI 另读设计系统 skill。

- A8：固定格式 fixtures 覆盖分支/leaf、分页边界、半尾行、来源变化、缺失/不兼容、越权引用、大文件有界读取。
- 用禁用 spawn 的测试边界及隔离项目 sentinel 证明历史查询不创建 Agent/加载扩展；不会写入原生文件。
- 输出含可解释来源/覆盖与类型化失败，取消关闭资源；集成页面由 05 消费，无需借执行路径读历史。

## 边界与完成

不扩大 S3 控制/恢复、S4 文件/Diff 或 M2 认证/附件/多 Thread；不修改官方 OMP。按风险验证并记录实际结果，无头通过不代表 GUI 或用户认可。阻塞票须 resolved 后开始依赖工作；未知工程细节按现有证据收敛，重要新产品取舍才对齐用户。

## Comments

### 2026-09-28

依据用户“保留官方 OMP。开始同步规格并推进 to-tickets”创建。本票尚未领取、实现或验收。
