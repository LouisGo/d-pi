# d-pi PR Standards 独立只读评审

结论：在下述固定输入和覆盖范围内，新增确认的高价值 Standards 发现 **0**。这不是整个 PR 无缺陷的结论：另一独立 Spec 评审提出的导航切换期间旧可见性/未读竞态由主 Agent 单独核实、修复，不能由本报告关闭。

## 固定范围

- base 与实际 merge-base：`1c9c30afb83a01531b11b02d30f2dd8f7ff6f586`。
- head：`f7dff7bc2c980ae1a61fb7f3736d15a0de6a6d8c`。
- 输入：`git diff base...head`、`git log base..head`，31 个提交；包含基础诊断和多 Thread 提醒，不只审查最后布局修复。
- 开始时仓库 HEAD 等于固定 head，`git status --short` 为空。随后以 `git archive head` 固定 `src`、相关合同/模块清单/skills 于 `/tmp/d-pi-standards-fixed.SPUO3G`；判断不读取后续浮动 WIP。
- 已读根、app、platform、preferences、execution AGENTS，code-review、TypeScript、state-query、headless、design-system/Impeccable 相关指引，以及诊断、基础、导航、存储和设计合同。已有独立评审作为覆盖索引，仍检查实际固定源码与直接调用链。

## 已覆盖的实际边界

1. Main attention/diagnostics IPC 与 preload：受限 schema、trace/reply 关联、当前窗口 main frame、异步返回后的 source generation/frame/URL/process/routing 复核；Renderer 不获得 Node、任意路径或任意 IPC 权限。
2. Main 观察和通知：`desktop-services` 在窗口独立的 RuntimeView/SubmissionReceipt 发布路径接线，异常观察不控制执行；有界、临时提醒投影不复制 OMP 队列/历史，不以 ACK/idle 认定完成；去重、新问题和迟到失败纠正、原生失败诊断、关闭/释放及新窗口快照路径。
3. App 存储：schema 11 对 schema 10 的备份、两列迁移事务、默认关闭，AppStorage submission recovery → schema migration → queue recovery 顺序；通知偏好读写仅对应独立列，外观/语言保存不覆盖它们。
4. GUI 生命周期和查询：AppModel 持有 attention mirror 并释放，组件只订阅展示；正式 Router 准入、当前事件定位、inert/首次 Runtime 投影等待、RAF 取消及成功定位后避免再次夺焦；诊断只读 Query 的 scope、无重试/轮询、GC、旧采样与迟到隔离，导出和复制不进入 Query 命令重试生命周期。
5. 诊断复用：现有唯一 Main Writer；Reader 的目录/文件/字节/行/时限预算、协作让出、句柄关闭、拒绝 symlink/非普通文件；字段和精确机器码白名单（含 `notification-unavailable`）、秘密/路径/正文剔除；本地导出 `wx`/0600 临时文件、rename 和清理，来源变化不继续导出。
6. GUI 工程边界：沿用统一 token/密度，提醒中心独立滚动和阅读下限，Editor/Thread/四个阅读面板资源挂载及订阅边界。已有预算、迟到 inspect 和 harness 焦点恢复报告与当前源一致；本 reviewer 未把这些静态判断当成亲测几何。

一项关于 newer prepared/dispatching 与旧 terminal 的观察接线疑点，只有静态接线和潜在帧顺序，没有本次获得的真实 RuntimeService/Host 事件证据，已过滤，不列作确认缺陷或扩大实施范围。

## 验证与限制

实际执行固定范围 `git diff --check base...head -- src docs/architecture architecture validation`，通过。只读检索源码、测试和已有原始评审/证据；未安装依赖、运行测试、构建或启动 App，未修改源码、票、提交和原始证据。本报告仅写入 `/tmp`。

已有工程/候选记录是主 Agent 或既有 reviewer 的证据，本 reviewer 没有重新证明实际包身份、macOS 显示/点击、窗口几何、真实供应商、完整 V1-00/B6 或用户认可。固定 head 明确记录系统通知实际 `failed`、根因 `unknown`、真实显示/点击待验；这是验收限制，不据此猜测代码缺陷或签名根因。后续代码修复需要基于新的固定 SHA 增量复核，本报告不自动覆盖它们。
