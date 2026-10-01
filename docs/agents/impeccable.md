# 项目级 Impeccable 接入

日期：2026-10-01。用于后续 GUI 开发的设计指导；不进入 d-pi 生产依赖或运行时。

## 固定来源

- 仓库：[pbakaus/impeccable](https://github.com/pbakaus/impeccable)。
- 稳定来源标签：[engine-v0.1.9](https://github.com/pbakaus/impeccable/releases/tag/engine-v0.1.9)，解析到 commit `1123d118665cdf896454683daed3b0f712366bf7`。
- 安装的是该 commit 的 `.agents/skills/impeccable/`，skill metadata 为 `4.4.0`。59 个文件先与固定源码归档逐文件核对，launcher 的执行权限按归档恢复。唯一补丁是 `reference/degraded/asset-producer.md` 中 `../reference/component-review.md` → `../component-review.md`，修正上游损坏的相对链接；其余 58 个文件保持一致。
- 该源码目录的 `scripts/VERSION` 指定 engine `0.1.8`，与标签名不同；按文件中的实际要求运行，不擅自改成 `0.1.9`。launcher 初次下载会校验上游 SHA-256 sidecar，运行程序缓存于用户目录 `~/.impeccable/bin/`，不安装全局 skill。
- 上游 [Apache-2.0 LICENSE](impeccable-upstream/LICENSE) 与[第三方 NOTICE](impeccable-upstream/NOTICE.md)保留原文；不据此改变 d-pi 的许可证。

## 使用与边界

Codex 从项目 `.agents/skills/` 发现 skill；新安装在后续回合可用，若列表尚未刷新则重开会话。可显式使用 `$impeccable <command> <target>`，日常由根 AGENTS.md 路由到 [d-pi-design-system](../../.agents/skills/d-pi-design-system/SKILL.md)，再按任务选择上游 playbook。

根 [PRODUCT.md](../../PRODUCT.md) 和 [DESIGN.md](../../DESIGN.md)是现有资料入口，不另存需求、授权或视觉值。项目适配留在自有 skill，上游文件除上述链接补丁外保持完整，便于逐文件验证和升级。

本次采用 skill 安装，不接入自动 edit hook，也不预设 live browser、图像生成路径或每次必跑的命令链。skill 的按需选择和项目路由足以覆盖当前目标；hook、额外工具或重大视觉变更按实际需求再评估。Electron 真实 GUI 证据仍遵守项目验证合同。

## 检查与更新

从项目根运行 `.agents/skills/impeccable/scripts/impeccable engine-probe` 验证 engine；`context` 验证上下文读取，`signals` 检查产品/设计入口识别。它们是接入检查，不等于产品视觉验收。

更新时先选择固定 release/commit，比较上游 skill 和 engine 要求；用临时目录安装并逐文件核对后替换项目副本，同步本记录。保留项目适配与已有定制，不直接以浮动 `main` 或自动更新覆盖。运行 `pnpm check:fast` 并核对提交范围。

本次验证：源码归档逐文件核对、manifest/agent TOML/JSON/launcher 语法、`engine-probe`、`context`、`signals`、文档链接、Biome、架构边界及任务状态检查通过。完整 `check:fast` 未通过：现有 Node/pnpm 工具选择与项目声明不一致，且 HEAD 已存在的锁文件无法通过 `DEP-LOCK-FORMAT`；当前其他源码改动还使结构报告过期。本次未更改工具、锁文件或结构报告，不将这些检查宣称为通过。
