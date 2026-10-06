# 多提醒高度预算 Standards 独立增量评审

## 固定输入与方法

- base / 实际 merge-base：`833d571ea59508ecabdf4f3c681a64625358f928`。
- head：`e649ae443fd20d704a28d7ca532fb5451adf453e`。
- 差异：`git diff <base>...<head> -- src package.json validation`，生产增量为 attention-center class、局部 CSS、有界预算 harness 与版本 0.1.0-m2.19。
- 不依赖持续变动的集成 checkout：使用 `git archive e649ae443fd20d704a28d7ca532fb5451adf453e <明确路径集> | tar -x -C <mktemp目录>` 导出根/模块 AGENTS、工程 skills、相关合同、Renderer 源码及 token、attention 合同、package.json、attention harness、所属 spec 与原始预算 red/更早 timeout 日志；随后 `chmod -R a-w`。
- 不可变读取目录：`/tmp/m2-attention-standards-budget.r7EdbQ`；主要审查文件权限均为 `-r--r--r--`。补充 m2.18 原生记录用 `git show <固定head>:<路径>` 读取 immutable Git 对象，未读取未提交候选结果。
- 本 reviewer 没有安装、构建或复制 App；未改源、状态或提交。临时输入及本报告是唯一写入。

## 结论

没有新增有实际触发与影响证据的高价值 Standards 缺陷。静态增量符合既有所有权、生命周期和设计系统合同；m2.19 实际包 green 尚未由本评审确认，不能把本结论当成候选通过。

1. `.attention-center` 只限定提醒展示区域，`max-height: calc(2 * var(--control-height))` 从现有密度 token 派生；normal/compact 继续共用一份控件高度事实，没有添加独立像素体系或 JSX 密度分支。`flex-shrink: 0` 保留区域内可用控件高度，`overflow-y: auto` 为超额提醒提供独立滚动，`overscroll-behavior: contain` 不把滚轮继续传递到其它阅读区域。
2. 提醒中心在原 workbench flex column 中；工作内容继续 `flex: 1; min-height: 0; overflow: hidden`，Thread 阅读面板继续拥有自己的 scroll 与阅读坐标。增量没有移动 Composer/ReadingPane、重新创建模型、复制草稿或执行事实，也没有增加 effect/订阅/后台资源。提醒按钮沿用共享 Button、原真实 Thread 导航准入与 Main 快照，不改变回答/发送/unknown 恢复政策。
3. 包内预算样本要求至少四条由前序真实 SDK/localhost 流程产生的未读提醒，测当前活动 reading-pane、当前草稿 A_UNSENT_DRAFT，并把最后提醒按钮真实 focus 后检查其边界落在中心区域内；随后恢复原焦点（preventScroll）及中心 scrollTop。它核对实际可观察几何和焦点，不只断言 CSS 常量。normal、compact、560x720 窄窗以及原生同 Main 重开后设置了测量点；没有构造 Main 提醒或模拟系统 callback。
4. 当前断言覆盖当前阅读区至少四行、草稿保留、最后按钮经浏览器焦点滚动可达，并记录中心 scroll/client/高度、主题密度/视窗及截图。该样本足以针对旧包的实际挤压回归；它不等于 512 条压力矩阵、所有超小窗口、真实鼠标滚轮/Tab/辅助技术或所有草稿撤销/选区路径通过。新增界面几何的 green 必须来自新产品 source 的实际包结果，版本号本身不证明同源。

## 原始 red 与独立限制

- `attention-budget-red/package-log.txt` 是真实旧 m2.18 候选达到预算断言后的失败：entries=5、centerHeight=160、readingHeight=0、lineHeight=19.5、draft=A_UNSENT_DRAFT。失败由实际阅读空间缺失触发；既有草稿未丢失。这是本次目标缺口的有效 red。
- `attention-budget-initial-timeout/package-log.txt` 停在前面的 native interaction focus 等待；预算函数未运行，原因未证实。归档 README 准确单列为非预算 red，未松断言冒充通过。
- 固定 head 的 `attention-native-m2.18` 明确记录 system=failed、没有真实 OS 显示/点击、openRequests 为空；真实关窗后通过精确 bundle 的 Finder 双击重开，harness 核对同 Main instanceId 与单次 provider 请求。这些是原生历史证据，不是新 m2.19 布局 green，也不外推为 Dock 点击或通知送达。
- 本 reviewer 在不可变输入上执行 `node --check validation/m2/attention.mjs`，以及固定范围生产文件的 `git diff --check`，均通过。没有运行完整门禁、React、Electron 或新候选；m2.19 实际预算 green、最终包内 metadata/app.asar/ZIP 同源及实机送达限制由主 Agent 后续记录，用户认可仍独立。

## 追加：validation-only 样本复核至 63a578f

本节只扩展验证覆盖，不覆盖或删除上述 e649ae4 的生产结论。

- 固定 base / 实际 merge-base：`e649ae443fd20d704a28d7ca532fb5451adf453e`。
- 固定 head：`63a578f02ec3c3ce5b901d8c113094c2e5b37953`。
- 用 `git archive <head>` 导出本增量 attention.mjs、生产 TSX/CSS/version 与 sample-missing 原始日志/README，随后 `chmod -R a-w`；不可变目录为 `/tmp/m2-attention-standards-budget-followup.o8lIqa`。`cmp` 核实 production attention.tsx/app.css/package.json 与前次 archive 逐字一致。
- 本增量无新的高价值 Standards 发现，未修改 Main 权限、提醒事实或系统 callback。

`attention-budget-sample-missing/package-log.txt` 确认首次 e649ae44 候选在几何测量前因提醒中心缺失失败。此前步骤已访问旧失败/完成 Thread，窗口实际前台时它们被合法标为已读；因此旧流程依赖偶然保留的 unread，是样本问题。该记录没有被解释为布局 green，也没有取消读取/已读合同。

新增 workload 逐次通过正式新 Thread 按钮、正式发送和固定 SDK→localhost 流程创建四个独立 Thread。`M2_ATTENTION_BUDGET_i` 进入既有受控供应商的 completed 分支；等待真实 held response 后，经既有 selectThread 回到 A 才 release，随后 snapshot 核对刚创建的真实 threadId、completed、unread。每次 release 删除对应供应商 hold，四轮顺序执行，不与既有同模式请求重叠；未写 attention store、SQLite 结果或伪造 RuntimeView/receipt。

预算函数在测量前等待 DOM 至少四条实际 reminder 及活动 reading-pane，然后仍断言 entries>=4、readingHeight>=实际lineHeight*4、draft=A_UNSENT_DRAFT、最后按钮 focus 后完整边界在 center 内；额外要求 centerScrollHeight>centerClientHeight，证明这个多提醒样本确实产生内部滚动。各主题/密度/窄窗/重开测量点均传入 wait；没有为样本失败降低空间或焦点阈值。

本 reviewer 本次只做 immutable 源码/调用链/原日志复核，执行 archive 内 `node --check` 与固定差异 `git diff --check` 均通过。未安装、构建或运行真实候选；63a578f 的预算 green、实际新包身份与同源仍待主 Agent 验证。四个独立真实提交提高了样本确定性，不能单凭代码存在宣称新包通过、OS 通知送达或用户认可。
