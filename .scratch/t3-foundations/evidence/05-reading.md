# 05 阅读内容锚点与 attempt 证据

2026-10-07。主 Agent 在隔离集成树实施；纯模型/阅读视图提交 `1b6d90a`，正式接线建立在含01/02/03/06的 `7f407de`。本记录区分真实 Electron 几何、React/Query 行为与产品认可。

## 来源和最终合同

固定 T3 `10f39eb9ac80c9a4b7f5097575dd2addc3b6f631` 的 `timelineScrollAnchoring.ts`、`pageScrollController.ts` 及对应测试核实 rowId/offsetWithinRow/scrollOffset/atEnd、hydrate 基线和来源记忆。沿用 d-pi Thread/Query/Zustand；没有移植全局滚动控制器、动画、常量或虚构 native/live 共同身份。

- ThreadModel owns ReadingPositions；视图卸载保留，Thread dispose 清空且拒绝迟到写入。位置仅保存有界身份、页码和坐标，没有正文或执行事实。
- 32个来源锚点、128个分段位置，按最近更新顺序淘汰；单key/row ID4096 UTF-16 units。超长key走像素/局部分段回退，不让预算拒收导致无法翻页。
- 实时 scope 使用真实 generation；native scope 使用 Thread/session/source/page offset。历史选择与 cursor 也由 Thread 保存。native/live 分源，hydrate 不制造新轮次。
- DOM adapter owns ResizeObserver、MutationObserver和rAF，隐藏/卸载释放；恢复按 row+偏移，消失/缩短则夹紧像素 fallback，原先atEnd才跟随尾部。滚动定位只进行二分行查找所需布局读取；每帧合并变动。
- 正式 Conversation/History/子Agent有界正文复用Thread位置。封闭段的DOM、选区和滚动不随追加重建；返回同来源恢复页码及段内位置。
- 项目历史由既有 Query scope/cursor管理；绑定历史每次读取独立attempt UUID（gcTime=0）。旧结果不能结束新请求的busy或替换新页。这里只取消等待/更新权，不声称历史I/O物理中断。

## TDD与行为验证

模型/adapter缺入口是初始红灯；实际 React A来源选择第二段/scroll45，卸载、B默认第一段、返回A第二段/scroll45转绿。追加4097长度位置key用例先失败（点击Next后仍page0），改局部fallback后9个有界正文测试通过。

真实 QueryObserver：第一次同cursor读撤销后立即重新读取，旧请求先返回；新请求仍fetching且无旧data，旧cache被移除，第二返回才结算当前页。实际历史UI A→B→A同时恢复所选session、cursor offset100和第二段；另一Thread独立默认。

正式接线后，阅读视图、Query attempt、位置模型、navigation continuity及Composer continuity共12 files / **59 tests passed**。包括现有 hidden零坐标保护、Composer首帧夹紧、消费/编辑历史和流式封闭段选择。既有历史refresh fixture有act提示，断言全部通过。

## 真实 Electron 几何前后证据

命令：`pnpm build` 后 `node validation/m2/reading-layout.mjs --anchors`。Electron44.4.5/macOS arm64，以真实生产Main/preload/Renderer、SQLite和v3原生历史运行；合成只读项目、browse信任，没有供应商请求/真实账户/执行/工具调用。CDP仅改变renderer viewport并操作正式控件。

先修验证脚本旧sidebar/density选择器、单独启用anchors场景；这些脚本失败不作为产品红灯。实际旧ReadingPane像素接线的红灯：目标`anchor-10`设定40px，宽度960→1180后变为 **144.21875px**，偏差104px。正式内容锚点接线后：

| 场景 | 同一目标行内偏移 |
| --- | ---: |
| 初始 | 40.21875px |
| 宽度变化 | 40.21875px |
| 隐藏Composer | 40.21875px |
| Conversation→History返回 | 40.21875px |
| Thread A→B→A返回 | 40.21875px |

B使用不同Thread source、scrollTop≤1；A返回原source。对设定值误差≤0.22px，宽度前后漂移0px。3次采集场景保存原编辑器/草稿，最后SQLite submission/native_session计数均0。原始安全JSON见 [reading-geometry.json](reading-geometry.json)；截图在该工作树 `out/qa-convergence/`，已查看dark/restored截图。此样本证明实际窗口内几何，未声称OS窗口管理、长时间GPU/CPU或用户认可。

## 检查和限制

受影响59测试、全进程typecheck、Main/preload/Renderer build通过。impeccable detector对修改的五个正式阅读/Workbench视图返回 `[]`；未改变布局token、密度或阅读预算。

新bounded ledger本身不宣称性能提速；正向收益是内容定位、返回连续性及旧attempt隔离。只测有限synthetic rows和定义的像素偏移，不声称按字符重排定位或无限历史。已有Files完整layout probe在本基点代码区可见性断言失败，未以它冒充本票通过；本票运行明确的 `--anchors` 模式。完整组合check、04接入及Spec/Standards复核归07。
