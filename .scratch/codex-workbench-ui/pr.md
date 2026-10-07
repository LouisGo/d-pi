## Summary

旧侧栏与顶部工具条改为默认紧凑的 Codex 式工作台：一级导航、上下文侧栏、主会话、按真实内容开放的右/底宿主，共享 macOS custom header、独立滚动、三边受约束收起/恢复与窄窗策略。原生控件右侧为后退/前进/侧栏；IconButton 主图标与绝对 indicator 分离，未读或辅助标签不挤动图标。

设置使用带遮罩的大 Modal，背景会话保持挂载；新会话位于第二列顶部，打开项目为 Projects 标题右侧的加号。语言只在设置独立行；主题支持 light/dark/system，各有图标，系统变化更新解析后的颜色。统一取消应用控件 outline，保留键盘焦点背景/文字反馈。UI 仅消费自有 API，Base UI/面板库经自有适配；兼容旧密度字段而不让它改变布局。

Thread 准入、唯一 Tiptap、草稿/附件/撤销/IME/阅读及配置/提醒/诊断沿用原拥有者；生产空宿主关闭，不引入样本业务或 M3。

所属规格：[工作台切片](.scratch/codex-workbench-ui/spec.md)、[布局范围](.scratch/codex-workbench-ui/layout-first.md)。

## Evidence

[交接](.scratch/codex-workbench-ui/handoff.md)、[验证](.scratch/codex-workbench-ui/validation.md)、[独立双轴复核](.scratch/codex-workbench-ui/review.md)。当前应用源 93e18a5593df93806528d6858b173536ea5abb20，0.1.0-workbench.2 / 93e18a55-5aafdac5，dirty=false。完整 pnpm check：808 行为、35 架构、89 tooling 通过；2 个既有可选 native smoke 跳过。pnpm build、macOS arm64 打包及交互检查通过；62 条隔离 Electron 记录（61 断言与 1 项输入到 rAF 采样）通过。

新增红灯→修复包含 system 主题周期、侧栏动作位置/设置 Modal、项目图标受存量宽泛样式影响、Modal 初始焦点消费 Esc；既有正确行为补测不冒称红灯。OS media 变化在 Electron 模拟，未修改全局系统偏好。真实包 Main/preload/固定 SDK18.4.6、本地确定性 supplier 的 Router/附件/输入/冷恢复与 Modal 诊断、system 持久化通过：[21条结果](.scratch/codex-workbench-ui/evidence/feedback/packaged.json)，包含20项检查与1项原生检查点恢复；CUA 实际 Modal/诊断焦点、两次 Esc 顺序、项目选择和草稿保留通过。远端 CI 按实际 head 核实后转 ready。

用户已授权推送并合并此 UI PR；候选试用与认可仍分开。物理拖窗尚未确认，04 继续 claimed；系统 IME 候选窗、VoiceOver 和长时流式性能未覆盖，无真实账户或计费请求。

## Merge Danger

影响 Renderer 展示几何/控件/主题及 macOS hiddenInset，业务协调器、OMP 所有权和关闭保存协议不变。新增布局意图只存在独立 localStorage，旧 density 列不改写；源码回滚不会删草稿/附件/原生 session 或重发提交。

主题列新增可持久化 system（无 schema 迁移）；回退到只识别 light/dark 的旧包前，应先在当前包切回浅色或深色，避免旧 schema 解析失败。布局键旧包不读取。合并只交付工程改动，不将仍开放的物理拖窗验证或用户认可写成完成；不公开发布。
