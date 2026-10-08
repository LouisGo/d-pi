## Summary

打开已有原生会话曾要求手动读取、启动，CLI 历史还被统一只读拦住。现在历史默认进入连续时间线，常规 CLI 历史自动按项目整理；已信任项目自动准备当前会话，退出 CLI 后可在原 Thread、原 session ID/文件继续提问，冷重启后同样可发送。失败保留输入并可原地重试。

所属 [规格](spec.md#2026-10-08-cli-历史继续提问当前授权)、[交接](seamless-sessions.md)。纯本地草稿。

## Evidence

产品 `f795b82`。真实 CLI -> 桌面 SDK -> 冷恢复三次真实模型准确回忆原事实；正式 GUI 也完成同文件续问与冷重启续问，生成中切换项目历史可读，长回复完整保存为同一条。新缺口 TDD、受影响测试 68 项、类型/静态/架构/构建通过，独立 Spec/Standards 无剩余已证实高价值发现。证据与历史全量检查失败见交接；不宣称完整 check 或用户认可通过。

## Merge Danger

索引不自动授执行信任，陌生目录仍只确认一次。原文件粒度 lease 覆盖所有 d-pi 客户端，原生绑定、进程组关闭与 unknown 不自动重发保持。未修改外部 CLI 不参与 lease，接入前检查 writer/项目 CLI，但不能阻止之后另起不合作 CLI；占用保留历史与草稿，不强杀外 CLI。v12 数据库不能随代码 revert 降级删除。没有远端操作。

## 本地 PR 合并记录

2026-10-08 用户明确授权完成后直接本地 PR 到 main。已在隔离工作区合并，不改动主工作区的 Composer WIP。

- 目标基点：`main` / `ae94bc0bed8deba6a005c8b5ec79b16aa02f9df4`。
- 来源：`codex/seamless-session-experience` / `a9cf9a9d990f02242ce74d8e42585a63ffc21a2d`，35 个领先提交，覆盖本轮长会话体验、默认流程及 CLI 原地续问。
- 合并提交：`09a3ec83e2a90b67a689a939677b722bb5b2b095`，保留两个父提交的 no-ff 本地合并。
- 核实：merge tree 与来源 head 完全一致、来源 head 为 main 祖先；隔离 main 的 status/documentation 检查通过。产品源码没有因合并改变，沿用已固定的双轴评审、测试/build 与真实 CLI/模型/GUI 证据，未重复调用模型。
- 合并命令仅临时绕过已记录的 Corepack/pnpm hook 环境故障，没有改动 hook 配置。
- 没有 GitHub PR、push 或发布；本记录是本地 PR 流程。用户认可与 M2 父范围未改为 accepted。
