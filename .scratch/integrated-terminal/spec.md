# 集成终端：B 方案与有序实施基线

日期：2026-10-07。阶段：M3，专项文档与设计工作。固定基点：`598323321c8c2ba6eb177097e2042510c3b79d87`；独立分支 `codex/terminal-design`，不覆盖原会话可能进行的 T3 重构。

## 推进与交接

- 当前授权：完成集成终端架构、全部直接相关文档与实现依赖/验收标准。2026-10-07 后续用户明确“直接按照 B 方案”，并允许后续按需直接引入 xterm.js；不再比较替代方案。**本次没有终端功能代码、终端依赖安装、push或合并授权。** 计划/拆票/未回复不构成开发授权。
- 已定事项：D-40/[ADR-0003](../../docs/adr/0003-terminal-host.md)确定专用TerminalHost utility process、node-pty、主页面xterm.js、受限MessagePort与有界输出；D-13底部面板/Command+`、D-02 OMP所有权、D-05 macOS、D-21/D-22诊断、D-25/D-26阶段、D-28–D-30按功能交付、D-35/D-37类型/状态及D-39有限Effect范围继续有效。
- 文档交付：契约、验证设计、固定源码核实、ADR、任务DAG及入口同步已形成；具体检查与变更理由见[交接](handoff.md)。终端功能工程未实施，无GUI/性能/native验收结果。
- 用户试用：尚不可试用。方案确认不等于功能、性能或GUI认可；本轮不改变M2首版验收范围。
- 重要产品待决：下面仅两项，推荐足够具体；未回复不把推荐升为产品决定。技术预算、版本锁定、错误DTO和内部接口由实现Agent按契约处理，不逐项问用户。
- 继续边界：当前可以独立完善/核查文档；进入实施需后续开发授权，受产品待决影响的行为还需答复。xterm.js已获路线授权，实施时直接锁定兼容版本并接入，不重复询问库名。Effect不在终端已批准范围内。

## 产品待决

| ID | 问题与推荐 | 影响与依赖 |
| --- | --- | --- |
| T-P1 | 推荐按工作目录组织终端，创建时记录来源Thread；同目录Thread共享列表，切换不同目录看该目录列表，旧shell继续。首次打开空面板只显示“新建终端”，用户点击才启动，不自动spawn。 | 与按Thread各有终端相比，同目录行为更一致、减少重复shell，但需要明确共享标签。01的关联公开面、04列表/切换行为依赖此项；不影响源码核实、纯协议/schema和预算设计。 |
| T-P2 | 推荐隐藏/关窗继续；结束单终端对存活shell明确提示会结束程序，保留只读终态；Cmd+Q汇总OMP与所有存活shell，提供等待、结束后退出、取消。没有可靠job空闲证据时，即使只有prompt也算存活资源；不默认重启恢复shell。 | 保留后台服务，但退出时空闲shell也可能需要用户结束。01的最小退出准入、05组合退出交互依赖此项；常规清理、故障与身份契约可独立准备。 |

初期资源数量与输出保留是[契约中的工程预算](../../docs/architecture/terminal.md#5-输出确认背压与预算)，不是新增“完整命令历史”需求。后续若产品要求无限后台运行、完整输出导出/永久日志或App重启恢复，另定需求与权限/存储合同，不悄悄扩大当前实现。

## 单源文档与覆盖

| 内容 | 唯一详细入口 |
| --- | --- |
| 领域与现状、直接依赖 | [终端模块](../../docs/architecture/modules/terminal.md) |
| 所有权、协议、身份、信任、输出、生命周期、GUI/native接入 | [终端契约](../../docs/architecture/terminal.md) |
| 安全/正确性、同负载性能与独立Renderer升级条件 | [验证设计](../../docs/validation/terminal.md) |
| 固定参考源码事实与本仓库实装基线 | [源码核实](../../docs/architecture/terminal-references.md)、[来源清单](evidence/source-manifest.json) |
| 决定与理由 | [D-40](../../docs/decisions.md)、[ADR-0003](../../docs/adr/0003-terminal-host.md) |
| 任务状态、验证与实际交付 | 本spec、单独任务票及[交接](handoff.md) |

不将输出规则复制到基础契约/模块页/任务票；它们只维护所需总边界与链接。`architecture/modules.json`、构建配置、package/lock和源码不做占位登记。

## 开发切片与依赖

后续获得开发授权后从最新合适基点核实source/worktree，按下面顺序集成；成熟能力按固定源码直接接入，只有native ABI/登记门控/查询应答隔离/屏幕硬界这类关键未知做最小前置验证，并在所属票内记录失败与停止条件。无需先造完整终端平台。

| 票 | 可验收行为 | 工程依赖 |
| --- | --- | --- |
| [00 文档基线](issues/00-document-baseline.md) | 本轮完整设计与入口一致性 | 无 |
| [01 可信PTY与受管生命周期](issues/01-managed-pty.md) | 明确create/launch准入、真实shell与受管实例、close/故障清理及最小退出屏障；真实Electron/native包最小链路 | 00；T-P1/T-P2与开发授权 |
| [02 受限会话协议与屏幕恢复](issues/02-session-protocol.md) | 输入一次派发、尺寸、身份、snapshot/增量及重挂载 | 01 |
| [03 有界输出与背压](issues/03-output-control.md) | 完整队列记账、处理ACK、pause/resume、慢消费者及硬界失败 | 02 |
| [04 正式工作台终端](issues/04-workbench-terminal.md) | 用户显式新建、键盘/IME、主题/resize、隐藏重开、清楚状态 | 03；T-P1 |
| [05 多终端与组合退出](issues/05-multiple-shutdown.md) | 目录列表、资源上限、撤销、退出、Host公共故障域与OMP隔离 | 04；T-P2 |
| [06 组合验证与Dev交付](issues/06-validation-delivery.md) | 契约硬门槛、固定同样本性能、native包差异、试用证据 | 05 |

先串行稳定许可/协议，再接输出、GUI和组合行为；当前不按store/hooks/pages横向拆工。00完成只表示文档完成。04可形成内部操作路径，但不能跳过已受影响的退出/清理/输出门槛将其标为可用交付；05完成后及时给Dev试用，06完成工程验证，用户认可仍由本spec记录。

```implementation-plan
[{"id":"terminal-first-usable","tickets":["01","02","03","04","05","06"],"hold":{"01":"尚无终端开发授权；关联与最小退出准入待T-P1/T-P2答复，依据见推进与交接。"}}]
```

计划块只调度未来开发票，Blocked by只记真实工程依赖；重要产品待决和授权以正文/hold为准。当前Ready Frontier应为空；命令输出不授权实施。后续实现可按独立写集合理隔离，主Agent串行整合共享协议与状态，不混入原会话的T3改动。

```project-status
[{"id":"integrated-terminal","title":"集成终端 B 方案","phase":"M3","engineering":"planned","trial":"not-delivered","acceptance":"pending","evidence":["handoff.md","../../docs/architecture/terminal.md","../../docs/validation/terminal.md"],"next":"B与xterm路线已确认、文档已交付；待关联/退出产品答复及后续开发授权。","constraints":"本次仅方案与文档；不开发终端、不新增终端依赖、不push或合并；不扩大M2或D-39。"}]
```

## 初期方案与后续增强

初期交付：macOS arm64、本地shell、一个专用Host/最多4个存活会话、单前台显示、有限屏幕恢复、明确退出/故障、统一工作台与诊断。必过门槛详见验证设计，任一失败不靠评分放行。

后续按证据另开范围：独立Renderer、多个Host/更高并发、搜索/输出导出、shell integration/可信当前cwd、跨重启恢复、远程PTY、其他架构/平台、Effect生命周期迁移。既有shell自己的history由shell管理；App不先建命令历史或任务运行器。这些增强不阻塞当前简单方案，也不获得此次实现授权。
