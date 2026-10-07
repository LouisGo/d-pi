# A 基础布局验证

历史候选源提交：91499e7f73e15cf0c27906728c3cf361b8988cff；基点37e1a62b889fdfaa1db274b60bac69b98d54d23c。

## 工程与隔离 GUI

- `pnpm check`：通过；806行为测试通过、2项既有可选原生smoke跳过；35架构测试与89 tooling测试通过。类型、Biome、设计、i18n、设计/源码边界、架构、文档、结构、状态门禁通过。
- `pnpm lint:interaction`：通过。`pnpm validate:interaction` 实际Electron通过；当前统一默认尺寸，两主题、Portal、Monaco/Diff光标、选择、复制和阅读区段原生点击。该脚本的正式API不变；证据另存本目录，历史证据保留。
- `node validation/m2/workbench.mjs`：56项通过，[原始结果](evidence/native.json)。实际Electron窗口1440×900、720×540、1920×1080；三边拖拽/阈值收起/显式恢复/取消无保存/键盘保存、缩窗不覆盖偏好、标签键盘与关闭焦点、独立底部滚动、主题颜色角色传播；原Tiptap/Thread controller/阅读viewport/Monaco实例保持；撤销重做、Chromium合成输入、设置往返阅读坐标、长草稿与中文最小窗口预算。补充custom header从原生内容顶端开始、三边收起回焦、设置期间未读保留/一级导航提示、通知打开会话、大窗口WorkArea不限正文宽度；56条记录含一次CDP输入到下一rAF的耗时采样，该采样不能证明长时帧率。
- Impeccable detect：本轮新增外壳/控件与token无主要发现，[扫描结果](evidence/design-scan.json)。

右/底样本只在validation/m2/workbench.html隔离入口注册，生产无内容时关闭；样本Monaco来自现有只读适配器，底部只是滚动文字，不是PTY。截图production-*指正式App组件但仍使用隔离业务数据，不能当真实账户/provider证据。isolated-*另外展示测试宿主。

## 缺口先失败，再修复

默认尺寸和去密度入口回归先失败后通过；几何规则先缺模块失败，模型实现后通过；直接导入面板库的架构回归先证明原门禁漏检，再加入自有adapter规则后35项通过。Electron实际暴露恢复早于库约束注册、键盘提交读取旧DOM尺寸、关闭标签丢焦点、窄窗口底部挤占阅读区，均有失败断言与针对性修复后的同一检查通过。

设置返回的最初300px断言超过fixture可滚动范围，浏览器已先夹到231px；换成合法150px并扩大隔离阅读内容验证，未将错误测试预期宣称为产品缺陷。既有schema10迁移测试改为保留旧density列，不修改或重建旧数据。

## 覆盖边界

本页是工程/隔离GUI证据。最终包与固定官方SDK证据见下；物理拖窗继续在04待确认。Chromium composition覆盖合成事件，macOS系统输入法候选窗尚未覆盖；连续流式大历史的长时拖拽帧率与低端设备性能未测，资源未重建不等于流畅度证明。没有运行用户真实账户或计费请求；未知提交不重发，旧native session冷恢复仍只读。用户试用/认可单独维护。

用户截图对应的导航位置断言 `navigation-controls-follow-native-window-controls` 在修复前返回false，修复后通过：后退、前进、侧栏开关顺序位于macOS安全区右侧，左栏顶端无区域标题，主区不重复历史控件；收起后的恢复回焦检查继续通过。

新增键盘Enter恢复侧栏保留同一导航按钮焦点、缩窗导航换位不抢Composer焦点两项检查。原生包验证Router/草稿/附件/SDK/冷恢复已在381d105的干净包通过，新焦点修复后再生成并验证最终包。

图标中心专项：全现有图标按钮修复前false（空wrapper与flex gap），修复后6组几何与命中断言通过；逐个记录dx/dy、绝对indicator和pointer-events、中心点命中，同步覆盖light/dark、中文窄窗、未读状态、右/底关闭及0/999+/禁用长辅助标签样本。测试样本只在隔离底部宿主，正式无新增功能控件。

## 最终实际包

`node validation/m2/package.mjs dist/workbench-ui/mac-arm64/d-pi.app --router --attachments --workbench`：18项通过，[原始结果](evidence/packaged.json)。固定SDK18.4.6、真实Main/preload/SessionHost/原生SDK及实际包运行；本地确定性supplier，无真实凭据/计费。包内commit=91499e7f73e15cf0c27906728c3cf361b8988cff，dirty=false，build=91499e7f-7bca4f14，asar SHA-256=c2c8d7e1534b49d5b34ab7cf9c046c38fe3ca310bf567304fda4fbff8c9d0aab。包括标题栏同内容顶沿、原生控件右侧导航、图标中心/绝对状态层、默认紧凑与无内容宿主关闭；Router/POP/IME准入、两原生scope、草稿/附件/撤销/阅读/重载连续性、冷恢复只读。

CUA 原生检查以Main未变化的4cf3cee包执行：close/fullscreen/minimize控件可访问，zoom实际完成，窗口尺寸1728×1027。多次顶栏留白drag未观察到窗口坐标变化，系统记录Window move completed without beginning；原因未证实，**物理拖窗未确认成功**。截图期间CUA共享标记覆盖交通灯，不能声称红黄绿完整像素检验通过，[记录](evidence/native-window.json)。此前的CSS drag/no-drag断言只证明区域声明，A3该项继续开放。系统IME候选窗、VoiceOver实际播报与连续流式大历史长时帧率未测。

## 2026-10-07 七项试用反馈修正

两项新增行为回归真实先失败后通过：主题二次切换原为 light，要求 system；真实 App 原无侧栏新会话/分类加号/独立设置 Modal。相关 39 项测试通过，默认外观和业务资源订阅隔离继续成立。

[新隔离 Electron 记录](evidence/feedback/native.json)62 条通过（61 项断言及 1 项输入到下一 rAF 采样）：Modal 形态/遮罩尺寸/初始焦点、Esc 返回设置入口、背景会话保持挂载和阅读坐标、通知打开退出 Modal、窄窗与中文、三态主题及 OS media 变化、各类控件无 outline、现有几何/面板/图标/输入连续性。初始 Close Tooltip 会先消费 Escape，调整 Modal 初始焦点到类别导航后单次 Esc 关闭通过；宽泛 Thread 按钮样式导致新增项目加号偏心，限制到真实 Thread 行后同一实际中心检查通过。

[统一交互记录](evidence/feedback/interaction.json)通过：按钮、图标、navigation、选中按钮、summary 和 link 均无 outline，仍有可区分的键盘焦点背景/文字；保留选择、复制及 Monaco/Diff 合同。截图见[桌面设置](evidence/feedback/settings-light-desktop.png)、[中文窄窗设置](evidence/feedback/settings-light-minimum-chinese.png)。诊断采用包含式呈现，留在 Modal 焦点范围；包内 Main 操作另行验证。OS 外观变化由 CDP media 模拟，未改动系统全局设置。

## 2026-10-07 新版最终包与原生操作

应用源93e18a5593df93806528d6858b173536ea5abb20；0.1.0-workbench.2 / 93e18a55-5aafdac5，dirty=false。完整 pnpm check：808行为、35架构、89tooling通过，2项既有可选native smoke跳过；pnpm build 与 macOS arm64 打包通过。app.asar SHA-256：f5d6aaf359c4216c321299b47a70ce43b069237c3e3f67a68b6ae314cfdae61c。

`node validation/m2/package.mjs dist/workbench-ui/mac-arm64/d-pi.app --router --attachments --workbench --inspect`成功；[21条结果](evidence/feedback/packaged.json)包括20项实际检查及1项原生检查点恢复。真实 Main/preload/SessionHost/SDK18.4.6、本地 supplier；新增 Main 保存 system、三态循环兼容旧 density、Modal 内诊断可聚焦；Router/IME准入、附件原件与冻结、草稿/撤销/阅读、双原生scope、重载不重发和冷只读通过。2次 supplier 请求均 localhost fixture，没有真实账户或计费请求。

测试驱动先误匹配同名的一级导航图标而非阅读“会话”按钮，随后试图在 Modal 覆盖时点击背景模型动作；修正为可见文字优先、图标 aria-label 兜底、开放 Modal 限定查找范围，并在背景操作前关闭 Modal，同一包完整回归通过。此修正只改变 validation 驱动，不是应用修复或应用源新构建。

[CUA原生记录](evidence/feedback/native-cua.json)：实际打开设置 Modal、切 system 独立图标、诊断 traceId 输入聚焦、第一 Esc 关闭诊断/第二 Esc 关闭设置并回焦、Projects 加号打开原生目录选择、取消后同一 Thread 草稿 A_UNSENT_DRAFT 保留。物理顶栏 drag 前后均 x304/y105/1120×780，未确认移动；窗口日志仍有 Window move completed without beginning，原因unknown。系统IME候选窗/VoiceOver/长时流式性能未覆盖，04继续claimed。

## 2026-10-07 鼠标描边与键盘焦点纠正

用户明确保留 Tab outline，移除 hover/active 的不一致描边。真实根因是共享 navigation variant 在选中 + hover/active 时设置彩色 border，不是焦点 outline。新增边框回归先失败（[红灯](evidence/pointer-focus/red-navigation.txt)），移除两条边框状态后通过。中央规则由禁止全部 outline 改为只抑制普通指针焦点；focus-visible 使用同一 primary 角色与统一轮廓 token，恢复 Button、链接、summary、select、input、textarea、分隔条、文件结果和诊断字段的键盘提示，编辑器仍用 caret，浮层容器保持原焦点协议。select 的 hover/active 不再改变 border-color。

[交互检查](evidence/pointer-focus/interaction.json)通过，两主题实际绘制的边框/outline/shadow、hover/active/disabled/focus-visible、Portal 和 Monaco/Diff 选择合同分别验证；零宽或 none 的 border-color 随 currentColor 变化不等于绘制描边。新增普通 select 样本不含业务操作。

[工作台68条记录](evidence/pointer-focus/native.json)通过：67项断言/矩阵与1项输入到rAF采样。真实 CDP 鼠标 move/down/up/click，以及 Tab/Shift+Tab，覆盖两主题的一级导航、当前Thread、设置导航；hover/active/点击不新增描边，键盘回到同一按钮时 solid 轮廓可见。Modal 可见且启用的控件另验证键盘轮廓；原几何、图标中心、IME、撤销和资源保持检查继续通过。驱动修正了“点击会话一定留在该按钮”的错误假设（原拥有者会回焦Composer），按真实 Tab 顺序查找目标并等待焦点稳定；初始 Modal 单次 Esc 与后续状态矩阵独立验证，未改业务焦点行为。

pnpm check:fast、lint:design、Impeccable机械扫描通过。本修正范围为CSS与验证驱动，未改变App业务或持久化结构；新的实际包与远端CI另按固定source记录。旧“所有outline消失”记录是已被用户纠正的历史预期，不代表当前合同。
