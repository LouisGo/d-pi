# PR #4 与 UI 开发基点收口

2026-10-06最新用户授权：先push、处理干净远端PR与本次提交、同步干净main，随后用户开始UI开发。本轮不开始UI实现。已先push `main@7031b9692ee38abeb2c856014e68a26a40748098`，包含诊断与retro收尾；此前13提交从`1c9c30a`普通快进，未force-push。

## 整合范围

复用[PR #4](https://github.com/LouisGo/d-pi/pull/4)，原远端head `632be664431081fc2602d0016508cc4f279626bb`，本地提醒分支clean `ff528237c74082a414785e437eb99bd022c6b98f`追加真实Luna验证记录。该工作目录所属会话已idle，无未提交修改；不修改其checkout。root在`codex/m2-pr-cleanup`由main建立整合，保留两边commits，以普通fast-forward push更新同一PR head，避免重复PR/重新重放诊断。

实际merge-base `7c9e1fe`，保留retro的wait/CDP/证据交接与提醒产品/候选/真实供应商记录。仅冲突M2 spec和生成status；spec合并两边证据与最新授权，status从spec重生。`validation/m2/package.mjs`自动合并后核实实际createCdpClient/wait及attention接线，不以Git无冲突代替验证。

## 验证与独立review

原独立诊断、提醒及retro两轴报告与TDD原始输出均保留：[诊断](diagnostics-review.md)、[提醒](attention-review.md)、[retro](../ai-workflow-v13/m2-retro-review.md)。本轮固定整合head `3219e65`及import排序追加 `d83f8f0`进行Spec/Standards两轴只读独立review，覆盖PR实际范围/公共harness、手工合并与记录准确性；[本轮评审](pr4-review.md)两轴最终代码结论均为0高价值发现，独立79/118行为与各15工具回归及固定文档/状态/架构检查通过；最终管理追加另行固定核对。首轮完整check仅因自动合并后的import排序门禁失败，保留[失败](evidence/pr4-integration/check.txt)，只移动import后重跑。

[完整check](evidence/pr4-integration/check-final.txt)通过：798行为/34架构/89工具，2既有opt-in skip及所有类型/设计/i18n/文档/结构/状态门禁；[build](evidence/pr4-integration/build.txt)通过，保留既有Monaco chunk warning。整合产品src/runtime/package相对`3c4c106`无差异，公共harness为两边实际合并的版本。

原m2.20 ZIP SHA及app.asar按[历史身份](evidence/attention-package-identity-m2.20.json)核实后，解到root独立`dist/validation/pr4-m2.20-candidate/d-pi.app`，不写其它worktree。`node validation/m2/package.mjs dist/validation/pr4-m2.20-candidate/d-pi.app --attention` [实际运行](evidence/pr4-integration/package-attention.txt)17项通过，[结果](evidence/pr4-integration/m2-result.json)、[提醒](evidence/pr4-integration/attention-result.json)、[原焦点采样](evidence/pr4-integration/attention-focus-observations.json)、[身份](evidence/pr4-integration/candidate-identity.json)。固定SDK、真实Electron GUI及localhost，隔离HOME/App/OMP配置/项目，不继承个人认证；未运行`--attention-inspect`或重跑真实供应商，本次不外推OS显示/点击或原m2.19窗口证据。

本轮选定原始证据保留字节，不清洗ANSI或行尾空白；手写文档/source diff检查排除`.scratch/**/evidence/**`。交付前stage并从commit逐项核实SHA：[清单](evidence/pr4-integration/sha256.json)。最终head CI另按实时run核实，不把既有head CI冒称新head通过。

## 后续 UI 与边界

候选仍为m2.20产品 `3c4c106 / 3c4c1060-8b550d60`，本轮没有新产品修改或重打包。正式功能GUI可供用户从当前main继续UI组件和视觉迭代，入口为[总看板](../../docs/status.md)、本[spec](spec.md)、[设计系统合同](../../docs/architecture/design-system.md)及[设计skill](../../.agents/skills/d-pi-design-system/SKILL.md)。不将UI开工绑到完整M2验收。

01c真实系统通知显示/点击仍待验，m2.19实际failed，m2.20没有重复OS检查；App内回退保持，根因unknown。PDF视觉/OCR、完整V1-00/B6/系统IME及其余真实账户/工具/供应商组合、用户认可继续开放。已有一次真实LunaGUI生成证据不扩大为完整自开发闭环。SQLite schema11通知偏好是持久化one-way：revert代码不降库，回退须保留当前数据并用before-v11备份在独立数据根验证。没有公开发布/签名/新个人账户请求。

## 远端结果

PR更新、最终head CI、合并提交、main同步与clean结果待实际操作后填写。临时整合branch仅在主checkout使用，原提醒worktree保留。
