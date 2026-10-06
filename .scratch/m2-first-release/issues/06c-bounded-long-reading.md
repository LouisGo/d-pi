# 06c 有界长正文阅读

Status: resolved
Blocked by: none

M2 V1-07，D-16/D-24/D-26/D-28–D-30/D-32/D-35–D-37与B-03。授权与边界见[spec](../spec.md#2026-10-06-长输出分段阅读切片)。

## 行为与验收

实时消息/历史记录/子Agent结果保留当前原文事实；短正文沿用Streamdown+Shiki。超过有界字符/行预算的正文使用显式分段阅读（可明确原文表示），一段渲染固定上限，容器高度有界，不默认渲染整段巨型Markdown。下一段/上一段有可达键盘控件与覆盖提示，不静默丢弃；完整复制仍复制模型已有原文，原有Host/历史截断或缺口说明保留，不假装重读完整原生记录。

流式追加不能自动翻段或替换已稳定的已读段落DOM，选择与段内滚动保持；不同Thread/历史来源及记录身份不能沿用旧分段状态，主题/密度/语言更新不重建业务资源。规则可脱离React验证，GUI消费既有阅读投影，不新增可双写的正文、队列或历史。

TDD逐行为真红→绿，覆盖长单行/中文或surrogate边界/多行/复制/末段增长/身份变化与已读段稳定；真实挂载回归检查选择相关DOM及上游追加，不仅静态HTML快照。主Agent补实际Electron包的固定SDK长输出/复制/选择/切换/重连及主题密度验证。工程通过不代表用户认可。

## 归属

根单写共享管理状态。implementer写集：src/app/renderer/reading（不含无关submissions改造）、src/app/renderer/styles/app.css有界正文相关、src/shared/i18n/locales/{zh-CN,en-US}/ui.ts、docs/architecture/modules/conversation.md。不改input/interaction/OMP执行/存储/版本/模块清单。固定worker起点在spec派发记录维护。

## Comments

2026-10-06：工程完成并交付clean `0.1.0-m2.16 / c5315584-f375cd21`，产品source `c531558`、验证harness `3fdb25f`。723行为/34架构/70tooling、双轴独立review、21项实际隔离包内检查、ZIP CRC与app.asar同源通过；[候选/试用/边界](../long-reading.md)、[评审复核](../long-reading-review.md)。真实已取得长回复40784 UTF-16 units复制7段，剪贴板restored；SDK原生10MiB artifact缩减为41077 UTF-8 bytes，六段原文含缺口提示。父06/M2及用户认可不据此关闭。
