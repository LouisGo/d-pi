# 独立评审

2026-10-09，按 d-pi-code-review 的 Spec/Standards 两轴只读审查整段差异。独立 reviewer 为 `/root/spec_review` 与 `/root/standards_review`；主 Agent 实施、验证与整合。用户报告受测版本及 Git base 均为 `c14297c382fbf436d201605e0c0c9d04a4e0b637`。

## 固定输入

初次 WIP 复制到 `/tmp/d-pi-linux-repair-review/files/`，32 个文件与 manifest 指纹一致；`diff.patch` SHA-256 为 `1b406388a02ffa0e0f6a7de0968c49c6996c7d900a128fddb1870561cdbe8acc`。reviewer 只读副本，不与实施者同时写源码。

补充测试固定在该目录的 `supplement/`，diff SHA-256 为 `f7532706cb1d5795d301ba9e711a5ea1293b1ff784d7540bc9b0921f202a4b7e`；两文件指纹均核对。三份生产关闭源码保持与原固定输入一致。持久化源码指纹见 [review-manifest.json](evidence/review-manifest.json)；收尾文档和生成看板不冒称纳入生产行为评审。

## 结论与修复闭环

- Spec：初次 0 条高价值发现，补充评审 0 条新增发现。核对报告要求、可编辑门槛、跨导航保护、初始化关闭、保存失败/超时、旧身份、读取恢复、Portal/rail 及固定 SDK 规则。
- Standards：初次发现 1 项 P2 验证回归，没有生产行为缺陷。既有 `src/app/main/index.test.ts` 的 BrowserWindow mock 缺少 `isDestroyed()`，实际运行 8 项中 2 项失败；需要握手的既有用例也未先 restore ready。
- 修复：补窗口接口和生产 restore 前置，提示关闭后再开启新握手；增加真实 Main/SQLite 集成的从未 ready 直接关闭、ready 后 arm 和提示期间合并用例。主 Agent 执行两文件 32/32 通过。Standards 补充审查确认原 P2 关闭，无新增高价值问题；Spec 确认新增覆盖有效。

两轴均追踪既有 QuitCoordinator、只读 retry（不重放写入）、共享控件/token、固定版本 CPU 变体裁剪、baseline 普通文件校验、未知布局/许可/预算与实际 import 门禁。

## 限制

Standards 独立执行了发现回归的初次 Main 测试；补充 32/32 通过来自主 Agent 执行，reviewer 没有重复执行全矩阵。测试替换 Electron 系统边界，证明生产接线；已有 macOS Chromium 证据证明组件输入和层叠，均不证明 Linux 原生 IPC/弹窗体验或 SDK import。原 Linux 复试、真实 Provider/Models/图片/Host 和 build 137 终止来源仍需实际证据。
