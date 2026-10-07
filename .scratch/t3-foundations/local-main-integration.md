# T3 本地 PR 合入 main

2026-10-07。用户明确授权“本地 PR 到 main”。本记录随本地 merge commit 保存；实际合并 SHA 可用 `git log -1 --format=%H -- .scratch/t3-foundations/local-main-integration.md` 取回。没有 push、远端 PR、CI 或发布操作，acceptance 保持 pending。

## 固定范围与融合

- T3 原开发基点：`598323321c8c2ba6eb177097e2042510c3b79d87`；工程/复盘 head：`34c65d0c60d932da197031ada3efcba8756d77e1`。
- 第一轮目标 main：`991663477b2d075d27626cafd0c265f7acf50ef9`，融合候选`51a9b85`。终端 B 仅设计文档；总看板冲突从两侧规格重新生成。
- 写入 main 前再次核实，发现其已推进至选择组件结果`a47feec9d2cf4533ca57fa6effcb3d64903c083a`，因此没有合入旧候选。独立验证树融合新 main 为`21c0956`，最后仅安全排序import/export并刷新投影，冻结组合源码`a20a9c2246b35ca1ee3241015e0e2b8f7956606b`。
- 最终实际 merge-base：`a47feec`；目标main的终端 B、公共选择控件/焦点、T3六组基础结果与复盘均保留。History冲突采用公共Select的`onValueChange`，写入原Thread的ReadingPositions，清cursor/readBound和旧bound attempt；不回退为组件局部事实。
- 必要验证接缝适配：旧bounded-history测试仍定位native select，先报“missing history session selector”，随后改为真实公共Select展开/选择事件。原会话、分页、片段及A→B→A断言保留；这是旧测试接缝变化，不伪称产品红灯。

## 验证与独立复核

验证树：`/Users/louistation/.codex/worktrees/t3-main-verification/d-pi`，固定源码与其自身真实SDK根。冻结安装、显式Electron安装、`runtime:sdk`、`check:environment`均通过，固定Node24.21.0/pnpm12.8.1/Electron44.4.5/SDK18.4.6/Bun1.3.14。

第一轮旧T3树完整check为1009pass/1fail，单独PDF用例仍失败。全部资源hash及版本正确，实际Electron PID69132打开该树SDK guard；直接acquire返回`database is locked`。保留正在使用的Dev与内核守卫，未kill、删锁或替换其资源。同一`51a9b85`在独立SDK根完整check1010pass，确认该环境冲突。日志`/tmp/d-pi-t3-local-main-check.log`、`/tmp/d-pi-t3-local-pdf-target.log`、`/tmp/d-pi-t3-isolated-main-check.log`是临时证据，不是唯一可恢复依据。

最终组合源`a20a9c2`在20:01完整`pnpm check`退出0：全环境类型、Biome、design（含interaction）/i18n、source边界、architecture425、文档/结构/状态、架构负例/tooling、**174files/1011tests passed，2tests skipped**，Vitest24.64s。完整入口由`lint:design`内的`checkInteractionPolicy(root)`执行交互门禁，未添加重复接线。`pnpm build`退出0，保留既有PURE/chunk-size警告。built Main内嵌commit=a20a9c2、dirty=false、build id=`a20a9c22-455b0634`。日志`/tmp/d-pi-t3-latest-main-check-final.log`、`/tmp/d-pi-t3-latest-main-build-final.log`；按该SHA和README准备独立资源可重做。main收尾`pnpm check:fast`另通过，含直接`lint:interaction`。

组合行为另跑`bounded-history/project-history/diagnostics/controls`，**4files/21tests passed**，含实际Select选择原生session及page/segment恢复、诊断form显式提交。新main此前只改代码的三处import/export排序被标准门禁拒绝，随后只用安全Biome排序修复；没有更改焦点政策或控件行为。Impeccable针对冲突目标的mechanical detector为`[]`，不等同视觉验收。

只读独立Spec与Standards先固定`21c0956`，再窄核对`21c0956..a20a9c2`，两轴均无高价值阻塞发现。Spec核对History/attempt/锚点、DiagnosticSelect表单、不可用模型/显式Apply、阶段授权与来源；Standards核对两侧blob保留、所有权/资源守卫、公开API、真实入口和425/425机器投影。排序增量无顶层资源创建或导出集合变化。最终收尾文档/状态另按固定差异刷新覆盖。

## 限制与交接

最终合并只再更新规格/交接/PR、本记录和生成看板，不改变冻结组合源码。`b49c413`的真实macOS冻结复制JSON保留为[历史原始证据](evidence/electron-frozen-references-final.json)，不能冒称新的a20a9c2原生视觉或系统验证。本轮没有重录原生探针、供应商/个人账户、IME/VoiceOver、安装包或用户认可。

独立评审发现旧`validation/m2/long-reading.mjs`仍用`.history select`，也含旧密度/专注阅读入口；未证实完整旧探针能到达该步骤，未将其当产品回归。本轮不恢复整套遗留探针，T3当前reading-layout证据与正常自动化边界分别说明。

后续从main按[交接](handoff.md)使用`pnpm dev`。App数据按checkout路径隔离，旧T3试用数据与运行中的Dev保留，没有自动迁移；本地合入不替代用户认可，不授权终端开发或其它开放M2/M3票。
