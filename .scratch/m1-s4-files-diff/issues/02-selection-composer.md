Status: resolved
Blocked by: 01

# Monaco 与冻结选区输入

M1。D-07/D-10/D-24/D-33。Renderer 管理只读 Monaco 模型和 worker；按所见版本捕获原文、路径、行列，附入持久输入并保留来源。测试真实选择、切换/迟到、主题密度及开发/包内 worker。

## Comments

2026-09-29：只读模型、按左右侧捕获、冻结来源和 Tiptap 原子引用已实现；选区逐字符、引用插入及草稿往返测试通过。开发态使用隔离 Electron 副本，macOS 包使用 `0.1.0-s4.0`：两者均实际打开 Monaco、聚焦并附入 Unicode 选区；包内核对左右 Diff 可分别选取、重启后引用保留，主题与密度切换后代码视图可用。包内 asar 含 editor worker，交互期间未出现 worker 错误；没有单独量测 worker 线程内部状态。

2026-09-29 夯实：补选区超限拒绝（64 KiB，不截断）与 CRLF 保留单测；引用发送时不校验新鲜度、不提示过期，已记入交接边界，实现不变。

2026-09-29 S5 准入加固：Diff 比较规则收归 d-pi 所有（`MONACO_DIFF_OPTIONS` 显式 `ignoreTrimWhitespace: false` 并锁单测），缩进变化保持可见；缩进可见的视觉最终确认随 S5 GUI 验收。
