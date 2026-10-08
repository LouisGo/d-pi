# Provider 与 Models 验证

2026-10-08；基点 `f649457d063f7ab8abfb82a1ba63031cbce9fe77`，本地分支 `codex/providers-models`。真实固定 SDK、隔离 GUI、供应商账户与用户认可分别记录。

## 无头、IPC 与数据边界

- 原生 Provider、认证、多账户精确删除、角色层级、custom model CRUD、只读副本、source/revision/trace 保护的入口与源码证据见 [native-capabilities](native-capabilities.md)。读取不执行 helper、不联网、不迁移用户配置；写操作使用原生所有者。
- 设备收藏、隐藏与排序使用 App preferences 的单写通道。schema 13 升级前备份，提交恢复顺序保持。筛选、排序、上限、偏好失败保留和并发组合有确定性回归。
- Main 的模型选择等待真实 Host 终态，按 trace/generation 关联；失败保留旧模型，unknown 不自动重发。Composer 的同 ID 推理失败不会复用前一次 ack。自定义模型草稿和删除/断开确认绑定打开时 revision，外部变更不借新 revision 覆盖旧草稿。
- [model-capabilities](evidence/model-capabilities.json) 使用真实固定 ModelControls 和工作树 Host 对 packaged SDK，覆盖 default/off/effort、五类原生能力、实际档位回读；没有供应商请求。
- [model-guard-fixed](evidence/model-guard-fixed.json) 覆盖活 Host 更新凭据、新增模型、禁用、enabledModels、endpoint/header 改变、原生 command helper、llama.cpp/LM Studio lazy context。真实失败后修复：deferred headers 漏检、lazy context 误拦和 Settings listener 触发无关 helper。
- [native-role-guard-fixed](evidence/native-role-guard-fixed.json) 是最后 19 条流程证据：真实原生 ephemeral A→B→A、lazy clone、旧 B 在目录刷新后的 endpoint/header 变化保护，以及 native tiny role 在桌面 enabledModels 之外仍可执行。Desktop selector 保持其原生过滤；调用前保护遵守 OMP 自己的角色可用性。

## 集成检查

`8f47e5f` 的实现加生成报告执行 `pnpm check` 成功：所有环境的 TypeScript、Biome、design/i18n、source boundary、architecture/documentation/structure/status 门禁；39 项 architecture、125 项 tooling、1370 项 Vitest 通过，2 项按既有条件跳过。未靠禁用门禁或增大 heap 消除失败；共享 scanner 的 regex 重新扫描修复有回归。

同次 `pnpm runtime:sdk`：固定 OMP 18.4.6，112 packages，548.5 MiB / 650 MiB。`pnpm check:environment`：Node 24.21.0、pnpm 12.8.1、Bun 1.3.14、Electron 44.4.5 与全部 48 个精确依赖通过。使用本机精确 runtime PATH，命令记录没有把默认 shim 当成准备成功。

最终实现 `22569b7` 已重新准备 SDK，`pnpm check:environment`、`pnpm check:fast`、`pnpm build` 成功；最终原生 guard 在 worker 与独立评审者的 19 条隔离流程中均通过。最新 TypeScript/design/i18n/source/architecture/documentation/structure/status 门禁及 39 architecture / 125 tooling 均通过。

`a4d25ed` 的最后两次默认并行 `pnpm check` 在 Vitest 阶段遭遇同一剪贴板测试 worker 的 SIGABRT，不能记作成功。系统栈落在 Node `fs::CpSyncCopyDir` 的 directory iterator C++ 异常；根因未确定，没有修改该源文件、降低预算或跳过测试。该文件单独重跑 14 项通过；随后同一版本 `pnpm test --maxWorkers=2` 完整执行全部文件，215 文件、1371 测试通过，2 项按既有条件跳过。仅限制验证并发，未修改仓库测试配置。最新小增量只改变 native guard 的可用性 lookup，并以真实 19 条原生回归及独立复核验证。

最初完整检查发现 picker 固定尺寸未使用共享 token，已修复；最初测试发现旧 preload 用未写入的 locale 冒充 preference 保存失败，按 Main 的最新 locale 读取合同更新测试。失败保留，最终检查结果以本节记录为准。

## GUI 与最后确认

唯一首轮真实 Electron 使用隔离 HOME/config/App DB 和 localhost 模型 fixture，完成认证存储回读、模型 CRUD、收藏/隐藏、键盘搜索、管理入口和主题截图。启动 Host 时失败；[诊断](evidence/host-startup-diagnosis.json) 指向准备阶段 `inspect` 的 `get_state` 先于许可握手。Main 已增加真实红灯/绿灯回归：starting 阶段查询只读当前投影，不向 native stdin 写状态请求。

统一构建 `22569b77-dirty-7cd250c8` 的必要确认完成：[gui-flow](evidence/gui-flow.json) 记录真实 Host ready、`openai/gpt-fixture-custom` 原生回读、panel 成功关闭、Composer 实际发送、固定响应显示和 ready 收束；App schema 13、native session 与 credential 非秘密行通过。累计 1 GET `/v1/models` 原生目录发现与 1 POST `/v1/chat/completions` 生成，后者实际 model 为 `gpt-fixture-custom`，真实供应商请求 0。最初 harness 错把目录 GET 算入生成限额，已按类别修正，保留同 PID 续验记录；没有第三次启动或第二条生成请求。

最后 Kimi 浅色可读性和窄列表左对齐只重新编译 Renderer；[构建记录](evidence/renderer-polish-build.json)证明 Main/preload/SDK SHA 未变化。Main 仍为 `22569b77`，Renderer 为 `048d498d`，不冒称统一的新 Main 构建。[同实例最小确认](evidence/renderer-polish-flow.json) 8 项通过：新 Renderer asset、Kimi 主题色、实际鼠标输入无 outline、键盘行 focus-visible、Esc 回触发器、窄列表左对齐/无横向溢出、Host 和 generation 不变、没有新增请求。初次 harness 在 Dialog finalFocus 尚未完成时使用 programmatic click，焦点断言失败；随后真实鼠标和实际行/搜索焦点就绪的确认通过，未改产品焦点逻辑。Root 已实际查看最终截图；最后相关 4 文件 22 测试与 renderer typecheck 通过。

窄视图使用 800×900 CDP viewport 仿真；Electron CDP 原生窗口 bounds 不可用，未声称 OS 窗口 resize 验收。隔离 App 和 localhost server 已停止，见 [cleanup](evidence/gui-cleanup.json)。可复现流程脚本为 [providers-models-flow](../../validation/m2/providers-models-flow.mjs)。

## 未验证项

未使用个人账户、真实 OAuth 服务、真实供应商 API 或计费模型请求。没有执行打包、签名、公证、远端 CI、push 或 merge。供应商服务实际登录可用性与用户对体验的认可待实际试用；原生固定 SDK 流程和 fixture 不能替代这两项证据。
