# 全项目组织整理

2026-10-01。用户要求将上一轮 `app/renderer` 的组织优化扩至整个项目，整理实际职责混放的地方，并收齐导入、链接和验证，避免功能回退。基线为 `1bf146b` 加上一轮已验证的 Renderer 工作区修改；既有 `bun.lock` 保留。本轮修改留在本地，不推送或公开发布。

```project-status
[{"id":"project-organization","title":"全项目组织整理","phase":"基建","engineering":"complete","trial":"not-applicable","acceptance":"not-applicable","evidence":["spec.md"],"next":"组织整理与工程验证完成；继续按职责落点维护，新功能由所属切片授权","constraints":"保留领域公开面、资源所有权、持久化事务和恢复顺序；历史证据不改写。"}]
```

## 推进与交接

- 交付：沿用当前领域 / 环境 / 职责目录以及实现与测试就近放置的形式。目录深度由实际职责决定，不以文件数或行数机械拆分。
- 改动：Main 拆出 IPC、窗口呈现与服务装配，入口只组装生命周期；preload 拆分各类受限 bridge；input / execution / files 的适配与客户端投影按功能分组；配置设置拆分摘要呈现与认证交互；工程脚本按 checks / runtime / tasks / testing 分组。
- 保留：小而单一的领域目录、已有 platform 分组、shared 稳定值对象、明确命名的 runtime 薄适配、docs 分类、测试三种边界、按历史阶段组织的 validation 和 `.scratch` 证据。RuntimeService / SessionHost 不按行数拆开其共同因果状态。
- 所有权：D-02、D-24、D-29、D-35、D-37、D-38 继续有效；不改 OMP 执行与历史权威、不增加可独立双写事实、不引入新领域或权限策略。
- 重要待决：无。目录分组与窄的内部组合接口属于本轮可逆工程选择。
- 验证：迁移后的原有行为回归、各环境类型、架构与文档门禁、结构报告、完整 check / build；对被改动的 SDK 准备与打包路径补实际资源和原生闭环。独立 review 核对边界与行为等价。
- 试用：本轮是组织整理，不用原候选的工程或原生证据冒称新构建。实际运行验证与用户体验认可分别记录。

## 盘点与取舍

| 范围 | 依据与处理 |
| --- | --- |
| `app/renderer` | 上轮已整理，继续保留并纳入全量验证 |
| `app/main` | 入口同时内联多类 IPC、窗口呈现和服务装配，根目录堆放仓储组合与跨域 runtime 测试；按现有 lifecycle / ipc / wiring 收齐 |
| `app/preload` | 单入口内联配置、locale、项目读取、运行与草稿 bridge；保留单一暴露入口，私有 bridge 分开 |
| input / execution / files Renderer 与 execution Main/Host | 同环境内有独立功能 / 资源职责，保持 public.ts 外观并移动私有实现与对应测试 |
| configuration Renderer | 认证事件生命周期与摘要、表单、进度 JSX 混放；拆分仍保持折叠后订阅与 jobId 续接 |
| scripts | 检查、SDK 准备、任务生成和测试隔离混放；更新真实 CLI 路径、默认项目根和消费者，保留 pnpm 命令名 |
| 其余模块 / platform / shared / runtime / docs / tests / validation | 已有明确 owner、命名或证据阶段，不新增空层级；历史命令、哈希和冻结记录保留，现行 Markdown 链接随源码迁移更新 |

## 验证记录

- `pnpm check`：通过。所有运行环境类型、Biome、设计/i18n、源码边界、文档链接/锚点、架构、生成结构/总看板均通过；33 架构测试、47 工具测试、476 行为测试通过。固定 CLI artifact smoke 保持原有 opt-in，未运行（1 项跳过）；实际 SDK/桌面闭环另行验证。
- `pnpm build`：通过。沿用既有 Router CLI 循环依赖和 Monaco/语法资源较大 chunk 提示；本轮没有新增相关行为修改。
- `pnpm runtime:sdk`：通过。新的脚本路径实际准备固定官方 SDK 18.4.6（112 dependency units），上游源码保持原样，仅沿用已有受控资源副本 import 修正。
- macOS arm64 本地目录打包：通过。产物为 `dist/project-organization/mac-arm64/d-pi.app`，未签名，本地未提交 source；不构成发布或用户认可。
- [实际桌面闭环结果](evidence/package-result.json)：基于现有 `validation/m2/package.mjs --router`，只在临时 probe 把干净发布构建断言改为显式 `dirty=true`，验证器源码保留。确定性 localhost provider、隔离 App/OMP 数据和项目，实际发送两次，无真实凭据/计费。覆盖 finalized text、手动 scroll、Router search/POP 保留 DOM、选区/undo/redo、IME 阻止切换、两条并行 OMP scope、模型/effort/消息/草稿隔离、reload 不重发和冷恢复只读。系统输入源未实测。
- 独立只读 review：无剩余可证实的行为回退或迁移遗漏。63 个本轮迁移无目标缺失；53 文件除静态 import 外 AST 一致，其余分别为 fixture/mock 与根路径调整、settings 拆分和认证回归。817 个静态相对引用解析与 owner 保持；preload 12 个 bridge 属性 AST 一致。Main 仍按关闭握手 → closeIdle → diagnostics.close → configuration.dispose → store.close → setImmediate(app.quit) 清理，资源路径仍来自唯一构建入口。
- 原有 Renderer 整理保留，完整门禁和实际 Router 桌面回归包含在本次验证中。公开面、依赖授权、持久化 schema、权限及 OMP 所有权不变。当前 Markdown 目标随源码迁移收齐，历史原始命令/哈希不改写。
- 过程发现并修正：深度变化造成的剪贴板 fixture URL，以及 SDK 准备脚本内误被当作源码 import 的官方匹配字面量；相应既有回归与实际准备已通过。
- 工程验证完成时既有 `bun.lock` 未改动，尚未创建提交、推送或公开发布。

## 后续提交授权

2026-10-01：用户要求用通俗语言解释 Renderer 与全项目整理，并将当前工作区完整提交为一个 commit。提交范围包括两轮源码整理、配套测试/文档/生成报告/验证记录，以及原有未跟踪的 `bun.lock`（原样纳入）；忽略的资源和构建产物仍按既有 `.gitignore` 处理。此前完整 check / build / SDK 准备与原生闭环记录保持其实际执行时的构建身份，提交前再核实快速门禁；不包含推送或发布。
