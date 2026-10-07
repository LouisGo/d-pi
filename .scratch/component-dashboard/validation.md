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


## 用户反馈修正版

固定续作基点71bb9fb；源码评审823bbc18a2acb406afd4309d31e8d96003af5b47，包内源e97c5a05e40fc27ef809ee551943b1be5010c068（之后仅证据/交接文档）。

- TDD：[3项真实缺口失败](evidence/feedback/red.log)对应图标手写名单、顶部索引、Thread列未覆盖；[3文件35项针对性测试](evidence/feedback/targeted.log)通过，包含真实App入口与返回/资源保留及新增图标导出自动预览。新图标只在测试mock中存在，不加入生产源或看板名单。
- `pnpm check`：[完整记录](evidence/feedback/check.log)，typecheck/Biome/design/i18n/文档/架构/结构/状态通过，35 architecture、93 tooling及826 Vitest通过，2项原有跳过；与首轮相同，不冒称固定CLI native smoke已运行。
- Impeccable独立现状布局评估＋实现后机械检查返回空结果；一次宽/中/窄批量检查后修正搜索标签换行及精简说明，再确认，无未解决视觉缺陷。
- `node validation/m2/workbench.mjs .scratch/component-dashboard/evidence/feedback/electron.json --scenario=components`：末次26检查通过，新增完整工作区覆盖（无Thread/sidebar/辅助宿主）、图标纯预览、分类/组件锚点、1040×720目录预算、720×540滚动后目录常驻、返回原侧栏宽度。保留原悬停/移入/键盘、Modal/Esc、按钮/页签、真实分隔拖拽/重置、搜索及草稿/资源检查。[结果](evidence/feedback/electron.json)、[宽窗](evidence/feedback/components-light-wide.png)、[中窗](evidence/feedback/components-dark-medium.png)、[窄窗](evidence/feedback/components-dark-narrow.png)、[图标](evidence/feedback/components-icons.png)。首次悬停驱动曾超时，根因未确认；明确输入起点与启动布局等待后末次通过，未将该超时认定为产品缺陷。
- `pnpm build`与`pnpm exec electron-builder --mac --dir --config.electronDist=node_modules/electron/dist --config.directories.output=dist/component-dashboard-feedback`通过。复用已准备的固定SDK资源，无依赖/锁版本变化。[目录打包记录](evidence/feedback/package.log)、[包内源码/dirty/hash](evidence/feedback/candidate.json)。
- `node validation/m2/package.mjs dist/component-dashboard-feedback/mac-arm64/d-pi.app --scenario=workbench`：4项原生工作台/主题/设置检查通过，providerCalls=0。读取真实Main构建日志及app.asar/main核对e97c5a05-b19549d5、dirty=false与一致asar哈希；[原始结果](evidence/feedback/packaged.json)。

[本轮独立Spec/Standards复审](review.md)无高价值遗留问题。包内看板交互未单独重跑，所有本轮内容/锚点/窄窗由真实Renderer隔离场景覆盖；系统IME、VoiceOver、真实provider及用户认可仍未验证。
