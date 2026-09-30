# 工程与维护独立审阅

2026-09-30。未参与实施的独立子 Agent 只读审阅 [初次冻结清单](engineering-review-freeze.sha256)的 30 个文件，按 code-review 和适用合同核对。初次及两次中途哈希复核全部一致；修复开始后补测改变 notices 测试，原通过结果不扩展到新内容。

## 初次确认发现

1. P1：Main 初始 loopback URL 校验不覆盖 loadURL 的 HTTP redirect，`will-navigate` 不覆盖服务端重定向。真实 Electron 44.4.5 / Node 24.21.0 的隔离 fixture 从 HTTP 127.0.0.1 302 到 HTTPS 外域，获得 desktop、locale 与 restore=ready。[修复前原生证据](review-redirect-before.json)映射所有网络到 localhost，临时证书只用于 fixture，无凭据或 OMP。证据作用于旧 out 的确切哈希，不冒称后来源码。
2. P2：notices 用裸 `^## ` 识别续节，真实 marked LICENSE.md 的标题在 text fence 内；重复生成返回 0 却累积重复及破坏 fence。[隔离 CLI 证据](review-notices-before.json)和[新增目标红灯](license-headings-red.txt)确认。修复识别 fence 外章节，按许可证原文选择不会碰撞的 delimiter；[绿灯](license-headings-green.txt)及[实际 193 份声明重生核对](license-cleanup.json)证明稳定、原文/后续声明保留。

## 其余实际核对

- 初次 tooling 39/39、architecture 32/32，窗口/Main/preload 25/25，标准工具/架构/文档/看板/结构入口通过。
- 真实临时 Git push/receive 对照未发现相对 hooksPath 行为损坏；未把未经证实的 cwd 猜测记为缺陷。
- CI 固定 Action commit/metadata 与 macos-14 arm64 在官方来源核对；标准 pnpm 入口实际通过。直接 node 在隔离 HOME 的 Corepack 上下文失败不冒称 pnpm 入口故障。远端 CI 未运行。

原审阅没有 commit/push、修改源码或重跑完整 SDK/冷启动矩阵。

## 补修独立复核

[32 文件新冻结](review-fixes-freeze.sha256)前后三次逐字哈希一致，清单 SHA-256 为 `adc2d6170d4e1de202151c32f37c912ca388b770c24c2c403e690924fd85dfbd`。初次 P1/P2 均关闭，未新增可行动缺陷：

- [原 HTTPS 场景复核](review-redirect-fixed.json)：新 Main SHA-256 `6c3a7c2fd36fa9069fb5d2c606b98859bd158eed766b87a11404699ff8e24e9a`，build `3285474e-dirty-1f488792`。外域请求 0、外域未加载/获得 bridge，内置回退 IPC 正常。合法 loopback 原生结果由维护 Agent 执行，审阅者核对源码/同构建证据，没有声称自己再次运行。
- [193 项实际依赖声明复核](review-notices-fixed.json)：隔离副本重生两次，与新实际 notices 及相互之间逐字相同，原 HEAD 的 SDK suffix 逐字一致。
- 独立窗口/Main/preload 36/36、notices 2/2 通过。首次 notices 一项子进程超时，单独复跑通过，未确认根因；没有隐去或当作已证实代码缺陷。窗口关闭/回退失败由自动化覆盖，没有真实多窗口矩阵声明。

D-07 的 Monaco 必需声明集合最后补齐，另冻结[两个文件](monaco-gate-freeze.sha256)。删除声明和锁条目的目标负例先红，最小增补后独立 7/7 通过，两文件前后哈希一致；原 32 文件其余 30 个未变。这是基建门禁补齐，没有版本/应用行为变化。最终包由主 Agent 验证，远端 CI 未运行。
