# S1 本地诊断测量

只用于 S1 固定输入负载，不进入产品包。运行前先关闭其他使用同一 Electron 二进制的验证窗口，以免原生 UI 工具选错实例。

```sh
pnpm build
node validation/s1/performance/build.mjs
D_PI_DATA_DIR=/tmp/d-pi-s1-perf-new pnpm exec electron out/s1-performance
ELECTRON_RUN_AS_NODE=1 pnpm exec electron out/s1-performance/task.mjs
node validation/s1/performance/summarize.mjs
```

GUI 每轮点击“下一轮固定负载”，在正文相同位置输入 `12345678901234567890123456789012` 重复 10 次（320 字符），等保存完成后点“记录本轮输入”。固定前两轮为预热且仍保留原始数据，其后交错 off/on 各五轮。只接收可信 beforeinput，以事件捕获至 rAF 后下一任务的时间作为反馈代理；不是显示器光子延迟，也不用于验证 IME。正式 Renderer、Main 服务、IPC 和存储实现复用当前源码；仅验证构建插入开关与记录入口。各轮重新加载同样的 21099 字符草稿，累计输入不会污染下一轮。

输入结果在隔离数据目录 `input-results.json`。RSS 是 Electron app.getAppMetrics 所列 Main/Renderer/辅助进程 workingSetSize 之和，每轮结束采一次；不能代表长期内存稳定性。Main 的诊断开关仅在验证构建存在。退出处理对 off 模式无 Logger 另作空 Promise 适配。

无头 task 使用同一 DraftController / DraftService / SQLite / Diagnostics，32 次 edit、间隔16ms，等待真实300ms合并保存与回执，正文约21000字符。它衡量当前持久输入任务，不是 OMP 任务或 GUI 端到端时间。结果写在命令输出的临时目录。汇总脚本读取仓库 evidence 中已留存的当前样本；新测量需明确保存新文件，不自动覆盖历史结果。原始样本及先导波动均保留。
