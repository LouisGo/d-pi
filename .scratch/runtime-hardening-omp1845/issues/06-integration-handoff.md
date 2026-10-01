# 06 契约同步、集成验证与本地候选

Status: open
Blocked by: 02, 03, 04, 05

范围/授权见 [spec](../spec.md)；关联 D-02/D-03/D-21/D-22/D-24/D-26/D-28–D-37 与 [M2 03](../../m2-first-release/issues/03-entry-candidate.md)。05 已获认可，纳入完整切片的集成验收。

## 交付与验收

- 更新实际变化的基础契约、configuration/runtime-host/execution/conversation/input 模块页、flows、模块 AGENTS/公开面、机器依赖和现行 SDK 维护。校正现行导航中的旧 configuration 描述与 manifest 文件数量；不改写历史证据。
- 按仓库 Node/管理器现态完成必要 typecheck、行为/架构/文档/状态门禁、pnpm check 和 build；资源替换后真实 validate:sdk。工具前置失败与业务测试结果分开，不能降低门禁来过关。
- 干净源码与 SDK 18.4.5 生成 macOS arm64 候选，记录 commit、build ID、dirty、包/asar/hash、SDK/Bun 实际身份；本地包内双 Thread、配置身份、模型实际值、Renderer 重连无重发、冷旧记录只读和故障后的状态检查。
- 受影响 GUI 验证菜单能力、失败来源/partial、未决结果与待答过期；必要输入/阅读检查采用真实 editor/窗口，静态源码不代替可见行为。
- 更新本切片 handoff 和 M2 关联记录，保留真实供应商、未知平台、原生扩展、冷恢复单写及 S3 09 缺口；用户试用与认可独立。

本轮不新增 updater、备份平台或签名/公证，不公开分发/push。文档准备不把任何实现票标 resolved。

## Comments

2026-10-01：集成票已拆出真实依赖，待方案审阅后实施。

2026-10-01（方案认可后）：用户认可完整方案，05 纳入集成依赖；实施在新会话开始，工程票保持 open。
