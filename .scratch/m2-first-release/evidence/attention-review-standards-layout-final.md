# 失败收据可读布局 Standards 最终增量复核

- 固定 head：`d272bd6bfb9a4a7f4d54e0a20b69940c514ede82`。
- 固定 base / 实际 merge-base：`672afdc675f835ecde2a000088020cf75da2b9d3`。
- 命令：`git diff 672afdc...d272bd6 -- src validation`；共三个文件。经授权将独立 review checkout 切至该提交，前后工作树干净。
- 范围：ThreadWorkbench 局部布局接入、真实 React 导航连续性回归、actual package harness 的失败结果可见断言；按既有导航/状态生命周期/设计系统合同复核，不扩大为完整候选验收。

## 结论

没有新增高价值 Standards 发现；生产修复与回归方向符合原合同。

1. `ThreadWorkbench` 只有 attention target 的 kind 为 failed、当前 readingView 为 submissions、工作区实际存在匹配 trace 的收据三个条件同时成立才启用 readingFocus。条件不满足时显式 false，needs-answer 不隐藏运行/交互控件，缺匹配收据的失败沿用 runtime fallback。
2. 复用既有专注阅读状态和还原控件按钮，没有添加独立执行状态、收据事实或第二份编辑正文。ThreadContent/Composer/四个 ReadingPane 保持挂载，仅使用既有 hidden/data-reading-focus 布局；既有 Thread 路由按真实 thread.key 隔离实例，视图层 rAF 在目标或页签变化时取消旧调度，未迁移 Main/OMP 生命周期。
3. `locateAttention` 仍只展开当前匹配 trace 的可得收据、滚动并聚焦；没有匹配则读取运行状态回退，不回答/重发旧请求。失败定位开启阅读模式后，rAF 在更新后的几何上执行定位；新增 readingView effect 依赖确保只在对应提交面板打开时应用。
4. 真实 React 回归通过生产 Router/AppModel/ThreadWorkbench，验证阅读模式、details 展开、实际焦点、同一 editor DOM 和草稿、还原控件，以及缺收据/needs-answer 的 false 分支。已读取 `/tmp/d-pi-attention-reading-red.txt` 的目标 false != true 失败与 green 的 10 tests passed；它们是主 Agent 实际执行证据，本 reviewer 未重跑 Vitest。
5. harness 现独立读取真实失败状态 p 的 rect，以窗口四边为初值，并逐层与所有 overflowY/X 为 auto/scroll/hidden/clip 的祖先 rect 取交集；要求状态全文落在交集且含实际失败文案。原匹配 trace、真实 focus、details open、元素/视窗存在检查仍保留，不通过手工伪造 Main/系统通知事件取得证据。

## 已见证据与限制

本 reviewer 实际查看原 `attention-macos/m2-attention-click-failed-receipt.png`：图中候选为 672afdc，失败收据只露出很窄的阅读区域且状态被裁切；该图是修复前证据，不是新 head 通过截图（主 Agent 计划归档到 attention-macos-pre-layout）。

本次执行 `node --check validation/m2/attention.mjs` 与范围 `git diff --check` 均通过。未 install/build、修改源码/任务状态、复制或启动 App，也未独立证明修复后的实际 macOS 几何；新版包需运行加强后的可见性断言并查看新截图。系统通知显示、点击、OS 权限/签名、native inspection timeout 及最终包内 metadata/app.asar/ZIP 同源不在本增量复核证明范围，不能由失败收据布局通过外推送达或用户认可。
