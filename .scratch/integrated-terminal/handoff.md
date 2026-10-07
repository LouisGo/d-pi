# 集成终端文档交接

日期：2026-10-07。源码基点 `598323321c8c2ba6eb177097e2042510c3b79d87`，本地隔离分支 `codex/terminal-design`。本轮只交付方案与文档；终端功能未实施，没有shell/GUI/性能通过证据，没有push或合并。

## 可审阅入口与结论

从[spec](spec.md)查看当前授权、两项产品待决和任务依赖；详细行为读[终端契约](../../docs/architecture/terminal.md)，验收读[验证设计](../../docs/validation/terminal.md)。[ADR-0003](../../docs/adr/0003-terminal-host.md)/D-40已按用户后续明确选择将B与xterm.js路线记为确认；不再保持“用户未选择B”的旧状态。

Main管目录/信任准入、宿主监督与退出；专用TerminalHost管理node-pty/shell、有界headless屏幕及输出；主页面Renderer采用xterm.js，受限MessagePort直达Host。OMP仍在原SessionHost/原生执行边界。snapshot/增量、输入一次派发、处理ACK/信用、pause/resume、慢消费者、隐藏/重挂载、Host丢失、清理与native资源均有可验收契约。共享Renderer仍须测输入尾延迟与长任务，不保证零卡顿。

开发按01可信PTY与生命周期 → 02协议/屏幕 → 03输出流控 → 04工作台 → 05多终端/退出 → 06组合验证交付；当前没有开发授权，计划的Ready Frontier为空。xterm路线已定，后续实施时直接引入兼容版本，无须重复问库名。Effect终端选型未获D-39范围扩展。

## 直接相关修复与删减理由

| 原指导 / 缺口 | 当前处理 |
| --- | --- |
| 终端模块称Main拥有PTY，显示/宿主细节待选型 | 改为D-40的准入/监督与专用TerminalHost所有权；细节由新契约单写 |
| P-04、技术评估仍将xterm/node-pty保持未选择候选 | 终端部分由D-40/ADR确认，其余浏览器/PNG等候选状态保留 |
| 模块只有“以后核实”的泛化清单 | 替换为具体协议、资源释放/身份、失败与任务入口，不复制预算 |
| OMP的始终消费stdout/原生历史规则容易套到PTY | 基础契约显式分清OMP与用户终端；用户PTY允许有界pause且不存OMP历史 |
| 模块地图/交接/Thread/退出/安全/交付缺少独立终端入口 | 补导航与交接图，标明已确认设计/未实现，不伪造源码、机器登记或包能力 |
| 隐藏、结束、宿主重启、App重启容易混用 | 契约区分显示订阅与进程，明确已退出shell不能恢复；初期不承诺跨App恢复 |
| 输出ACK可能只到传输或库内部，快照可能漏跨块状态 | 明确write callback处理确认/绘制另测、分片信用、同水位恢复、完整ANSI边界与应答单写 |

仅替换重复/过时的当前终端指导；`docs/archive/pre-reset`、原始访谈/历史证据、其他功能资料不删除、不改写。源码、package/lock、构建配置、模块机器登记不变。参考核实为固定官方快照与25个文件哈希，见[记录](../../docs/architecture/terminal-references.md)/[manifest](evidence/source-manifest.json)；没有继续扩展替代方案对比。

## 验证与实际限制

本次只需要文档、状态、依赖与写集检查；不跑无改动的功能构建、native或GUI矩阵。实际通过：`pnpm check:fast`（环境/格式、交互规则、296份当前Markdown的链接/锚点/D-ID、架构边界、结构快照与22范围/117票的看板）；`plan:slice`确认01 held、02–06 blocked、Ready Frontier为空；Git差异检查及来源manifest核查。原始结果见[快速检查](evidence/fast-check.txt)、[文档检查](evidence/document-checks.txt)、[状态检查](evidence/status-check.txt)、[计划输出](evidence/slice-plan.json)与[写集/来源核查](evidence/scope-check.txt)。

运行`pnpm report:status:write`时，pnpm自动从本地store补齐了隔离worktree的既有锁定依赖；没有新增终端包，package/lockfile没有变化。后续直接以Node运行聚合脚本，不重复环境补齐。

功能工程状态仍planned，试用not-delivered，认可pending。T-P1（目录/Thread组织及显式新建）、T-P2（单终端结束与App退出交互）只记录推荐；未回复不是认可。native ABI、启动前登记、查询应答隔离、屏幕硬界和系统IME/性能要在实现票取得证据，不能用此次文档检查冒充。前会话T3改动不在本写集内，原checkout保持不变。

## 后续本地集成授权

2026-10-07用户追加“没有问题的话，本地PR到main”。原文档阶段无合并授权的记录为历史快照；当前spec/生成看板已同步允许复核后本地合入main，仍不授权终端实现或远端push/合并。两轴只读独立review无阻塞发现，授权补充后快速检查通过；具体范围与限制见[本地PR记录](pr.md)。实际来源head/目标main合并结果由Git记录核实。
