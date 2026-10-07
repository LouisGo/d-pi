# 04 Clipboard handoff P2 修复证据（2026-10-07）

固定 base：`828095185d2f3880a3ae931875d32b417f285167`；隔离分支：`codex/t3-clipboard-handoff`；工作树：`/Users/louistation/.codex/worktrees/t3-reads/d-pi`。文档先补 `docs/architecture/modules/input-context.md` 的窄合同，然后独立复现并实施。没有改 spec、票、status、生成文件、ThreadModel/Workbench 或诊断目录；无新 operation/code、库、权限或发送能力。

## 根因与实际红灯

在固定 base 直接运行独立复制的真实 PM + DraftController + DraftEditorCache + Main service + SQLite + 私有对象复现：32 张源图 × 4 次 paste，各次立即 Undo，flush 保存空稿，await clearHistory 后正文空且 Redo=false。第 5 次 Main import 预期 clipboard-imported，实际 clipboard-unavailable/busy；`pnpm test tests/integration/clipboard-handoff.integration.test.ts` 于 16:15:18 退出 1（行为断言失败，不是类型或 setup）。既有 store 只在 draftBoundRevision 出现后解除 clipboardImports，清掉 Undo lease 并不结束这些从未采用的 clone 原 import pin/128 handoff quota。

另一个实际红绿边界：当前正文包含合法图片 token 和相邻 `[[dpi-attachment:broken]]` 字面量时，整段 readAttachmentTokens 返回失败，会让缓存淘汰遗漏实际 clone。16:20:59 的独立反证得到 deletedObjects=1（预期0）。改为复用实际 editor 的 atomic token 识别，跳过冻结选区正文；同样反证随后绿灯。

## 最小合同与实现

复用严格 history-release DTO：可选 leaseId、releaseIds、retainIds，后两者各最多 80,000，覆盖单个 4 MiB 草稿。leaseId 为空仍可清理未确认或失败 update 的 candidate；旧调用缺 releaseIds 只释放旧 lease，没有新增 clone 删除授权。累计 candidates 超单次上限时按 80,000 分片，所有片同 retainIds，仅第一片带 leaseId；ensure 等完整序列，重试幂等重放完整计划。

Main 同步验证 lease owner/Thread 后解除历史 lease，再仅释放同 owner/Thread 的候选 clipboardImports，排除当前 body retainIds 和其他有效 Main epoch 的实际 IDs。当前未保存 clone 始终保持原 import pin；没有提前只转历史 pin，也不为普通 PDF 重新开历史 lease。当前 body/epoch 候选仅作 cleanup ID 投影，重复 reset、失败和迟到 open 不丢失候选；失败清理保守保留 Main pin，并在来源屏障中等待/显式重试。

改变 store 函数只有 releaseEditorHistory。EditorHistoryLeases 新增 dependencyIds/retains 只读查询；原 save/publishManifest 的03同步发布与 PDF预算检查完全保留。Main service 向 store 实际转发新字段；PDF integration bridge 也实际转发字段，避免假绿。Cache 从实际 Editor doc 或 DraftController 当前正文读取保留 IDs，清史/淘汰/restore mismatch 保持正文唯一拥有者。

## 实际证明与资源样本

最终 `tests/integration/clipboard-handoff.integration.test.ts` 的实际 preload/Zod + PM + Main/SQLite + 私有 PNG 样本（8 tests）：

| 行为/资源 | 实际结果 |
| --- | --- |
| 128 never-adopted clones、空稿、清史 | 第5次真实 clipboard paste 插入32个新 token，一次Undo回到空稿；无需 document reload |
| 未保存 clone，Undo 后仍可 Redo | manual GC deletedObjects=0；Redo 恢复原文且 Main preview 为 image |
| 放弃正文且显式清史 | manual GC deletedObjects=1，私有 object 确认不存在 |
| 当前正文未保存，连续两次清史 | durable body仍空；GC删除0，preview仍为image；随后正文放弃/清史删除1 |
| cache threads=0 淘汰当前未保存正文 | controller仍有真实 token；GC删除0、image可读；document release后删除1 |
| 相邻 malformed literal | 淘汰仍保留合法图片；GC删除0 |
| 另一 live epoch、foreign lease release | foreign为 reference-denied，GC删除0；同owner最后epoch解除后删除1 |
| history-update 未获确认 | 清史仍精确释放 abandoned candidate，GC删除1 |
| 两个各约2.14 MiB有效正文共80,002不交集候选，首release失败，再快速reset/clear | 实际preload/Zod单次payload合规，空稿清理分片为[80,000,2]，ensure恢复true；不要求reload |

其中预算恢复样本是实际 wire schema 的 headless core 边界，未伪造80,002个 Main资产（Main clone budget始终128）。其他图片样本均使用真实 Main store、SQLite和filesystem。GC反证均先移除源Thread正文和源document snapshot权威，避免用源引用掩盖目标 pin 缺口。

T3固定源码 `10f39eb9ac80c9a4b7f5097575dd2addc3b6f631` 的 `apps/web/src/composer-undo-grouping.ts` 实际确认 `markAsClipboardEdit` 用 uiEvent=paste/cut，异步paste必须独立Undo组。本次保留原PM grouping，未借用T3外部 asset URL 或其blob生命周期；clone交接回收是针对d-pi Main私有资产/Undo合同独立设计。

## 门禁与限制

受影响 input 全模块、Main attachment IPC、preload及clipboard/PDF集成：23 files / 96 tests通过，随后最终新增预算反证与真实第5次paste后的目标回归为2 files /12 tests通过（8 integration +4 core）。Core、Renderer、Main、preload严格类型通过；architecture423、documentation、Biome与git diff --check通过。原PDF20byte清史后retry和同IDderivedDigest Undo/GC反证仍通过。

这次不操作系统剪贴板、不触发个人账户/远端动作；真实OS clipboard验证由Root已有probe统一完成。Root串行合入后执行整段check/build与独立Spec/Standards followup；本证据是隔离工程证明，不等同用户体验验收。动态跨Thread @文件/目录产品语义仍待用户决定，不因本P2修复解除。
