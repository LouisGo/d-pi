# M2 生命周期切片独立评审

2026-10-06。真实 base / merge-base：`c8dbdbadf1a04ad2be54e01f1a509024c5d982ea`；产品最终 head：`c5e424da02245ed854c9ba3af514087826b6cc24`。范围：[04b](issues/04b-attachment-lifecycle.md)、[05d](issues/05d-subagent-observation.md)、[06b](issues/06b-lifecycle-candidate.md)。两名独立 reviewer 在固定、干净的隔离 checkout 分别覆盖 Spec 与 Standards，不修改代码；根 Agent 核实并修复实际缺陷。

## 高价值问题与复核

| 问题 | 触发与影响 | 修复与证据 |
| --- | --- | --- |
| Spec P2：最后释放时钟依赖维护采样 | 七天前释放的内容在两次扫描之间重新采用并移除，旧时钟会导致提前自动删除 | 草稿 CAS 同事务仅对变化的合法附件 ID 更新原件/派生摘要时钟；`fb0792c`，真实失败→通过，冻结与 unknown 保持保护 |
| Spec / Standards P2：原生 yield 结果解析 | 子 Agent 先写 prose，再 yield 结构化 `data`；观察只显示 prose，且合法 `error:null` 或 `data:null` 处理错误 | `fb0792c` / `237912c`：按固定 SDK 语义优先有效 data，空 data 回退 error/prose；实时与 transcript 真红→绿，不复制执行引擎 |
| Standards P2：普通编辑扫描全部附件库存 | 每次草稿文字保存触发全库存查询，10,000 对象实际源码探针约 535–553 ms | `237912c`：比较前后 token ID 集，仅变化 ID 分批 PK 查询；最终独立探针约 0.025–0.110 ms。仅证明隔离 SQL 方法性能，非 GUI 延迟承诺 |
| Spec P2：采用后立即移除造成导入 lease 泄漏 | 内容在首次维护扫描之前已持久采用再移除，扫描无法得知历史采用，当前进程无法回收 | `830bccc` / `c5e424d`：CAS 同事务记录首次 `draftBoundRevision` integer；异步旧 manifest 发布保留该记录；只解除对应 Thread/source 租约，同摘要其它来源继续受保护 |

初评固定 `1465004`，后续按 `fb0792c`、`237912c`、最终 `c5e424d` 复核。合法 nullable 分支属于同一结果解析缺陷；未重复计为多项。整数写入回归曾真实失败（SQLite JSON number 被写成 real），最终使用显式 INTEGER 转换通过。

## 最终结论

- Spec reviewer：最终增量九文件及受影响整体合同已核对；此前三项 Spec P2 均解决，无新增高价值问题或范围扩张。独立隔离五文件 **51/51** 测试通过。
- Standards reviewer：最终增量及整体合同核对通过，无新增高价值问题。独立实验确认同事务 integer revision、异步旧 manifest 保留、同摘要来源隔离、原件/派生时钟更新；260 个来源分为 127 / 128 / 5 扫描，采用历史不增加活引用。`git diff --check` 通过。
- 两者固定 head 与 merge-base 未变化，checkout 前后干净。两名 reviewer 未独立重跑全量工程或最终 macOS 包，相关验收由根完成并见 [交接](lifecycle.md)。

原始独立探针已保存在本机 `dist/validation/m2-lifecycle/reviews/`：`spec-repro.test.ts`、`standards-benchmark.mjs`、`yield-probe.ts`、`adoption-probe.cjs`。根的真实红绿及完整检查在 `dist/validation/m2-lifecycle/`，可移交摘要见 [候选证据](evidence/lifecycle-candidate.json)。

## QA 与证据边界

首个实际包的阅读区只有 74.03125 px，未达到既有 100 px 门禁，未交付；附件存储入口收在现有折叠区后，最终实际默认阅读高度 101.53125 px，发送可达。早期 DOM 回归因断言早于异步查询完成而失败，不将该时序失败冒称布局 TDD 红灯；实际包失败是布局依据。

首次子 Agent 包内计数把两次原生 task 标题请求算作执行，误报 reconnect 重放；已依据完整请求与 SDK 调用区分辅助标题请求和真正执行。最终为四次子 Agent/父执行、两次标题请求，无重放。崩溃窗口是持久状态 fixture，并未证明真实断电；本轮未使用个人凭据或调用真实供应商，也未进行新增系统输入法测试。

补可见卡片截图时，同一包曾在队列保存后立即 `.click()` 删除按钮超时。失败现场 Main 只有 begin/update/save 三次操作，没有 delete 请求；UI 合同在保存请求 pending 时禁用删除。harness 原先只等待新文本与编辑器关闭，可能早于请求结束。已追加等待真实按钮 `disabled === false` 后点击，保留原删除、原生请求数量和收据断言；产品源码未改变。原始现场保留在 `dist/validation/m2-lifecycle/capture-timeout/`。

最终修正后的补截图 harness 保持全部22项通过，运行/完成/浅色紧凑卡片截图已核实并纳入证据。移交用真实红绿输出保存于 `evidence/lifecycle-{root,retention,yield,adoption}*`，完整检查与最终快速门禁亦已保存。
