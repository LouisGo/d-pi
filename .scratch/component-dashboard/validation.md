# 验证记录

2026-10-07。固定源码评审 Head `655e955936965a206f40d1ced9a96117266a66f6`；候选构建源 `232f76bcce22e37e6cf765298d9d6f15af8817ec`，差异仅状态及评审/证据文档，应用与验证源码无变化。

## 工程与行为

- `pnpm check:environment`：Node24.21.0、pnpm12.8.1、Electron44.4.5、OMP SDK18.4.6/Bun1.3.14 检查通过。
- `pnpm check`：typecheck、Biome、design/i18n、文档、模块边界、结构与状态门禁通过；35 architecture、93 tooling、824 Vitest测试通过，2项跳过。固定CLI native artifact smoke为已有 opt-in 项，此次未运行。完整记录见[check.log](evidence/check.log)。
- TDD：Router准入/保留位置、HoverMenu、看板完整索引等各自缺口先失败再实现；真实 Composer 在途附件导航用[失败记录](evidence/attachment-navigation-red.log)确认进入会错误准入，修复后[3文件35测试](evidence/attachment-navigation-green.log)通过。覆盖同事件file-picker、真实Composer drop handler/Tiptap的延迟插入与完成后准入、flush期间新意图复查。drop为真实注册处理器调用，不冒称物理拖文件。
- 双轴独立评审见[review.md](review.md)：一个有实际完成链的P2已核实修复，复审无遗留高价值问题。

## 图形与候选

`node validation/m2/workbench.mjs .scratch/component-dashboard/evidence/electron.json --scenario=components`：19项隔离Electron真实渲染检查通过。覆盖设置上方工具入口、hover和移入菜单、8个真实组件、共享样式、按钮/页签、真实指针拖拽/重置、Modal/Esc、搜索空状态、light/dark、720×540无横向溢出、键盘菜单、返回保留草稿/Thread controller。

- [浅色宽窗](evidence/components-light-wide.png)、[深色宽窗](evidence/components-dark-wide.png)、[深色窄窗](evidence/components-dark-narrow.png)、[完整断言](evidence/electron.json)。
- `pnpm package:mac`：SDK准备、最终production build与macOS arm64目录包通过，[构建记录](evidence/package.log)。
- `node validation/m2/package.mjs dist/mac-arm64/d-pi.app --scenario=workbench --workbench`：在独立临时App数据根及含空格的复制包中运行真实Main/preload/SessionHost/固定SDK，4项原生工作台/主题/设置检查通过，providerCalls=0。包内身份来自真实Main日志，并读取app.asar内out/main/index.js核对，[原始包记录](evidence/packaged.json)、[候选身份](evidence/candidate.json)。

组件看板全部交互由隔离真实Renderer场景覆盖；包内场景只覆盖工作台启动/主题/设置。系统IME候选窗、VoiceOver、真实账户/provider未验证；本任务未改变这些能力。工程检查与候选不替代用户认可。
