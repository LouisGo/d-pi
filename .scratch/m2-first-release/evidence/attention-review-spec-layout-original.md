# M2 提醒点击失败收据：实际可读性补充审查

固定源码：主 worktree HEAD `672afdc675f835ecde2a000088020cf75da2b9d3`；相关 ThreadWorkbench/定位/CSS/harness 与上次固定 `e651e34f2ce21ef49e50fe57322ac10532521436` 无差异。只读核实，未修改源、状态、构建或运行 App。

## P2 / Spec + GUI：失败提醒定位到被阅读容器裁切的收据

位置：`src/app/renderer/workbench/thread-workbench.tsx:48`。验证缺口：`validation/m2/attention.mjs:355-359`。

触发：正常工作区在现有窗口高度、紧凑密度下点击后台 failed 提醒，匹配收据实际存在。定位 effect 无条件 setReadingFocus(false)，保留 setup 与 Composer；Composer flex-shrink:0、setup 自有预算，thread-reading 仅接收剩余高度（app.css:154-176、361-365）。locateAttention 展开 details 并 scrollIntoView/focus article，但不会增加阅读容器的可用高度。

实际证据：本轮候选截图 `.scratch/m2-first-release/evidence/attention-macos/m2-attention-click-failed-receipt.png`（m2-result.json build.commit=`672afdc675f835ecde2a000088020cf75da2b9d3`、dirty=false）显示提交原文页签已选中，收据 article 有焦点边框，但阅读区只有一条窄缝；失败状态行被底部裁切，无法直接读到完整“原生返回失败”、正文或核对提示。不是仅根据 CSS 猜测。

现有 failureDetail 保存 article top=444.2734375、bottom=593.7734375、viewport=748。其断言只核对 window rect 与 computed visibility，不求与 reading-pane/thread-reading 及其他 overflow 裁切祖先的交集；元素 box 进入窗口而祖先裁掉大部分内容仍能通过。截图与成功 metrics 因此不矛盾。

要求：first-release.md:172 的点击定位到对应问题或结果、navigation.md:33 的匹配收据展开并聚焦，以及设计系统合同实际几何和无截字/遮挡要求。定位的结果必须实际可读，焦点或 textContent 存在不能替代。

最小修复建议：只在 failed 且当前 trace 匹配到实际收据时启用已有阅读专注模式，再在布局完成后定位。它已经负责隐藏 setup/Composer/配置，使阅读区获得可用高度，无需新 token 或布局系统。needs-answer 应保持 readingFocus=false，让实际交互位于可见 setup；failed 缺匹配收据的 runtime fallback 也应保持 false，否则 runtime 会被隐藏。不要按 failed kind 一刀切进入专注模式。

验证建议：回归定位策略分支（匹配 failed receipt / missing receipt runtime fallback / needs-answer），真实包内检查失败状态段落在 reading-pane 与所有 clipping ancestors 的有效可见区域内至少完整可读，并保留 article 焦点和 details open。对短状态行做几何核验，不要求长正文 article 全部同时在屏幕上。用同一 viewport/密度重新截图，确认完整错误状态和可用阅读空间；当前仅 window rectangle 的断言需要替换。

结论：新增可达高价值 P2，建议本轮候选修复后定向复验。用户仍可手动进入专注阅读绕过，但提醒点击的直接定位体验未达到当前要求。本 reviewer 没有进行新的 native App 操作；证据来自本轮真实候选截图及源码调用链。
