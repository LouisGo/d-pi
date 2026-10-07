# 04 clipboard cleanup recovery followup

固定代码基点：466e08c6fe894f264503a0e8fa299ebbc8c012b3；隔离分支codex/t3-clipboard-recovery。只改input headless/history/cache与必要PM adapter及所属模块合同；不改ThreadModel/Workbench、Main Store/DTO、diagnostics、spec/tickets/status/generated，不push/integrate。Main保留03 publishManifest、20byte PDF清史预算及可信owner/document/thread校验；没有新operation/failure目录。

## 根因与合同

旧enqueue把failed清掉但failedRelease仍在，后续successful update可遮蔽cleanup失败；reset把old failedRelease置空，丢失真实Main leaseId；cache eviction立即移除model/barrier，没有重试owner。三种都是未完成清理义务被当前epoch/视图生命周期覆盖。

先更新模块input-context合同，再实现：cleanup map按真实lease或candidate-only计划保留，queued/failed独立于当前update；只有实际Main ACK才删除。跨reset/late-open/eviction都保留。retry等待已有flight后重试全部未完成清理及当前update；每个清理chunk读取当前可信Controller真实正文ID及当前epoch保守before/doc ID集合，包括未确认/失败update。分片wire仍80,000；无第二正文、无EditorState私有Branch。

Cache最多9个history owner（活跃/缓存/未完成退休合计），另最多9个待准入Controller及总80,000 candidate IDs。投影只有IDs；退休owner仅model/Controller/屏障，clear回调查cache当前owner、不捕获退役Editor。预算不足拒绝普通docChanged之前的PM transaction；正常旧owner在途结束表现pending并在Main ACK自动drain。新owner先接棒真正before/doc Undo依赖并等待保护ACK，随后才允许save。普通冷Thread editable选项不变。

replaceDraftText使用窄可信meta允许consume/useStored正常替换，实际目标PM doc相等才成功并清史；不授予普通输入/clipboard此meta。同Thread Controller替换以新实际正文接棒retention/保存屏障，旧Editor迟到事件不写新owner。

新拒绝插入分支核对actual doc与tr.doc：普通附件false保持AttachmentModel uninserted；clipboard等待Main discard。必要discard失败由原Thread AttachmentModel保存原ids，与普通源失败排队，阻止继续clipboard-import，显式retry只重试discard。Main的cancelled仅在此命令表示成功ACK；其它取消不清源失败。4在途/128handoff Main预算给实际clone清理责任上界，不能用removeFailure放弃必要清理。

T3固定10f39eb9ac80c9a4b7f5097575dd2addc3b6f631的apps/web/src/composer-undo-grouping.ts使用uiEvent paste/cut与closeHistory明确独立动作；沿用该思想及当前d-pi PM grouping。生命周期清理按d-pi Main私有资产/可信Thread合同独立实现，不照搬外部asset URL或扩Effect/Atom/Layer。

## 真实红绿与资源证据

- 16:41 原live repro：32源图×4 paste→Undo→flush空稿→clear首次release不执行Main而unavailable→加入真实普通file image。旧controller.flush=true（期望false），retry假成功，128额度未恢复。新代码保持failed/save屏障，显式retry实际释放，Main第5次32图import成功。
- 16:49 原cache eviction repro：threads=0实际destroy，首次release未执行Main；同Thread重绑后retry的calls=1（期望2）、GC0。新代码实际calls=2、GC1；失败lease跨第二次clear仍实际回收GC1。
- 17:26 在当前PM准入门保留、将clipboard adapter恢复到原盲dispatch代码的反证：真实新Main ticket/export/import后，PM拒绝事务且doc保持原对象，discarded=0（期望1）。恢复实际doc核对与cleanup后discard1、GC1。另一普通附件原adapter falsely ready，修后uninserted-source保留，解除gate后真实插入/ready。
- 17:31 新discard第一次unavailable（未执行Main）反证：原直接request使getReadiness=ready（期望failed-source）。修后failed保存原ids，removeFailure仍blocked，explicit retry只discard且Main cancelled ACK后ready/GC1；额外无头样本保留前一choose-import源失败并逐个确认。
- 9失败退休owner真实达限：新Thread持久X、PM删除X；另以真实Main导出/导入新clone，PM插入时SQLite正文仍X（clone未保存），再删除clone。RPC失败时save/clear/retry不假成功，inactive Thread也保持屏障；恢复Main ACK→新owner接棒→save空稿→GC→Undo clone再Undo原X，真实图片preview均可读。证明预算恢复不会漏登记阻塞期间Undo依赖，未保存clone仍沿原import pin保护。
- 默认8 inactive cache+active的正常第10 Thread：不额外await LRU cleanup，hold实际Main release，new source pending且save等待；放行ACK后自动准入与save成功，不需要人工retry，GC/Undo X仍可读。
- 9 waiting来源硬预算后第10来源实际Editor.isEditable=false、普通insertContent虽可能command返回true但doc未变；clear/retry=false。可信consume替换actual doc正确、Undo清除、save仍守屏障。
- 同key真实新Controller body retained clone/empty两个分支分别GC0/GC1；旧Editor迟到不写新Controller，新transaction/save可用。当前新epoch update失败时，旧cleanup重试不能删新插入clone，GC/preview可读；结束新epoch后GC1。late Main open在reset之后release失败仍重试原leaseId。
- 既有80002 cleanup候选按actual Zod schema分片[80000,2]，同P2回归继续绿；当前body/Redo/其它epochs/原PDF20byte清史retry等反证继续绿。

## 检查与边界

2026-10-07 17:33:40：pnpm test src/modules/input + clipboard-cache-recovery/clipboard-cleanup-recovery/clipboard-handoff/input-history-retry integration，22文件107tests全绿。17:36加强同一达限样本的新未保存clone/Undo链，实际单例绿；17:38:30最终四个integration共23tests全绿，追加root tsc也绿。root/core/renderer/main/preload严格types通过；architecture 423源码、documentation references及35架构测试、11文件Biome、git diff --check通过。架构故障注入输出的SIGTRAP/ENOENT是断言夹具，35tests最终pass。

全部资源样本为真实Tiptap+DraftController+Cache+Main服务+preload Zod+临时SQLite/私有对象；未写默认OS clipboard、未访问账户/远端。Main服务fixture不是正式应用GUI用户验收。完整check/build、两轴增量review和冻结选区Composer实际拒绝结果由主Agent在集成SHA执行；无新业务正文事实、无修改readonly/发送恢复边界。

必要UI交接：附件失败卡片的移除失败操作对clipboard-discard应隐藏/禁用，必要清理仅重试可解除，model已保守拒绝dismiss。Composer冻结选区的dispatch实际结果由root接线，本worker不改该工作台实现。

## 迟到未使用clone清理（基点307850b后续）

正文/选区/generation/前台身份失效与拒绝dispatch同属原Thread责任；adapter/Editor销毁不等于Thread owner销毁。活着的AttachmentModel应统一持有必要discard并等待Main实际终态，不使用fire-and-forget；真实model disposed继续按可信document释放原合同，不复活owner。原failed-command队列、原IDs/Thread和失败期间拒绝新import保持。此补丁只写input源码/测试及本证据，不扩wire、诊断或工作台。

17:50:40新增真实Main/preload/PM/SQLite三变体（同Thread普通edit、adapter.dispose、Editor.destroy且Thread model仍活）：基点旧迟到分支均错误ready/failednull，三红。最小改动仅把current=false分支的direct fire-and-forget改为await原model.run clipboard-discard；17:51:06三绿。测试记录真实Main import原IDs与原Thread，延迟reply后使编辑身份失效，首次discard unavailable不执行Main；失败期拒绝继续import。移除所有独立snapshot/body/Undo引用并保存普通正文后GC0（仅未插入clone保留），显式retry只discard，Main cancelled ACK→ready→GC1/对象实际不存在。adapter/Editor卸载仍由活Thread负责；原Model disposed late-result/document-release实现未改。

17:52:03最终5文件33tests全绿（可信clipboard/AttachmentModel单元与三真实handoff integration），root tsc、renderer strict types、两文件Biome和diff-check均过。无Main/DTO/failure/operation或工作台变更；真实OS clipboard与完整集成门禁仍由root统一执行。
