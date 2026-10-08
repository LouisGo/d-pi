# Provider 与 Models 完整闭环

## 推进与交接

2026-10-08 用户明确授权：等待 chat `01a11b0c-042b-7371-8b3c-78c841d37878` 结束，从最新本地 main 创建 worktree，充分理解固定 OMP 原生 providers/models 能力，再先无头后 GUI 完整实现。指定 chat 已 completed；基点 `f649457d063f7ab8abfb82a1ba63031cbce9fe77`，集成树 `/Users/lou/.codex/worktrees/providers-models/d-pi`，分支 `codex/providers-models`。

同日用户明确回答“扩展到全部 OMP 原生认证”，本切片取代 D-23 的首批两项认证限制。OMP 继续拥有配置合并、凭据、认证协议、模型目录、角色与执行；不维护第二套认证或模型注册表。App 只持设备上的收藏/可见性/排序偏好。

结果：设置中的 Provider 主从管理视图，原生认证与取消/断开/刷新，模型能力目录和必要原生配置；Composer 的可复用搜索选择 panel、厂商/模型 logo、收藏及推理档位，成功显示实际原生回读。参考用户四张截图及本地 T3 `30cc788975500a8c00d32a50f348174d1ce578d1`；沿用 d-pi 的 compact、light/dark、自有 Base UI 组件与 token。

验收：确定性无头/IPC/原生隔离测试先行，集成检查/build 与两轴独立评审；一次有界 GUI 验证，必要修正后一次重启确认；最后纯视觉修正只在同一实例重载 Renderer，不再启动应用或发送请求。真实供应商登录需要用户实际账户交互，不能用 fixture 冒称认证服务验收；不自动计费探测。工程、试用、用户认可分别记录。

重要待决：无。原生注册表中没有可接入 API 的能力保留准确限制；可逆实现细节自主决定。初次交付仅本地；后续 main 合入与 push 按下方用户追加授权执行，不公开发布。

2026-10-08 工程闭环完成，Dev 已交付待试用。19 条固定 OMP 隔离流程通过；1371 项完整测试限制并发后通过、2 项按既有条件跳过，默认并行 worker 的失败和未知根因见 [validation](validation.md)。正式设置/Composer 已实际验证：凭据存储、模型 CRUD/偏好、真实 Host 回读与一次 localhost 发送响应；累计 1 GET 目录发现、1 POST 生成、0 真实供应商请求。深浅主题、键盘/鼠标焦点和 800px viewport 窄布局通过。两轴发现均修复；[交接](handoff.md)记录源码和 Main/Renderer 的不同构建时点，用户认可 pending。

同日用户追加授权“改完之后 本地 PR 到 main 然后进行 push”：完整合入 `codex/providers-models` 到本地 main，再正常 push `origin/main`。取代初次交付不合并、不 push 的限制；不创建远端 PR、不发布。固定实现 head `4d1223b525e7e6effba41351244ac68b9e6efa75` 的 29 个提交全部纳入；目标本地 main `f649457d063f7ab8abfb82a1ba63031cbce9fe77`，原远端 main `a0367becdf015a4b7fa7a31aa23050c74a275849`，本地原有 81 个领先提交随 main 一起正常推送。实际合入和远端核实结果见 [合入记录](local-merge.md)，工程/试用/用户认可保持分开。

已完成本地 PR 合入与 push：merge `55550021`、source `99ec699b`，完整 29 项原实现加 1 项治理提交保留，合并树与来源树完全一致；远端 main 已核实为该 merge。原目录 main 的固定 SDK、开发环境与快速检查通过；其后仅同步最终交付记录，不新增 GUI 或供应商请求。

## 范围与合同

- D-01/D-03/D-04/D-21/D-22/D-23/D-28–D-38；[配置模块](../../docs/architecture/modules/configuration.md)、[基础契约](../../docs/architecture/foundation-contracts.md)、[设计系统](../../docs/architecture/design-system.md)、[图标合同](../../docs/architecture/icon-system.md)。
- snapshot 只读，scope/source/trace 与可信目录一致；账户 secrets 不入 argv/App DB/诊断。显式写入/网络刷新与只读采样分开，保存前复核来源和外部变化，原生保存失败保留旧配置。
- 模型选择不设 GUI provider 白名单。可用性、kind、能力、成本/窗口元数据和角色来自固定 OMP；Composer 只提供适合对话且可用的模型。未知/partial、失效当前模型和非对话模型均准确呈现。
- 当前 Thread 切换使用现有 RuntimeService/Host/setModelTemporary；busy/readonly/旧目标保护与附件兼容预检继续生效，模型选择不静默修改原生共享默认。
- 设置明确当前配置来源和写入作用域。收藏/隐藏/排序只影响本设备 picker，不更改 provider 可执行性、原生配置或凭据。
- UI 图标与品牌资产只经自有 Icon Layer；保留 T3 版本/许可，未知品牌降级为清楚的通用图形。

## 实施计划

```implementation-plan
[{"id":"providers-models","tickets":["01","02","03","04","05"]}]
```

| 票 | 行为 | 归属 |
| --- | --- | --- |
| [01](issues/01-native-provider-models.md) | OMP 原生 provider/model 能力与受控接入 | omp_capabilities；/Users/lou/.codex/worktrees/native-providers-models/d-pi；codex/native-providers-models；base f649457 |
| [02](issues/02-picker-preferences.md) | 设备模型偏好与无头筛选/排序 | picker_preferences；/Users/lou/.codex/worktrees/model-picker-preferences/d-pi；codex/model-picker-preferences；base f649457。筛选规则主 Agent |
| [03](issues/03-brand-components.md) | 品牌 Icon Layer 与共享 panel 基础 | brand_components；/Users/lou/.codex/worktrees/provider-brand-icons/d-pi；codex/provider-brand-icons；base f649457 |
| [04](issues/04-settings-composer.md) | 设置与 Composer 正式组合 | 主 Agent |
| [05](issues/05-integration-delivery.md) | 组合验证、评审、本地交付 | 主 Agent |

```project-status
[{"id":"providers-models","title":"Provider 与 Models 完整闭环","phase":"M2","engineering":"complete","trial":"delivered","acceptance":"pending","build":"main merge 55550021；source 99ec699b；历史 GUI 构建身份见交接","evidence":["local-merge.md","handoff.md","validation.md","review.md"],"next":"已合入 main 并 push；从原项目目录 pnpm dev 试用实际账户与 Provider/Models 体验","constraints":"本地 PR 已合入 main 并 push，不公开发布；真实认证服务与用户认可待试用；默认并行测试 worker 失败与限制并发通过分开记录"}]
```
