# S1 当前交接

**2026-09-28 S2 前巩固**：草稿核对恢复、UTF-8 容量边界、preload 隔离、一致备份、桥接诊断和构建标识已实现；8 文件/33 测试及生产构建通过。新增视觉区域尚待试用，旧包未替换。详情和启动方式见 [巩固记录](hardening.md)。

**2026-09-28 策略与测试更新**：项目 skills 自动遵循 TDD/自动化优先，Computer use 保留给难以替代的少量原生/视觉检查或用户明确要求。新增 5 项关窗与自动保存回归，统一检查现为 7 文件/20 项通过；4 个针对性变异均被拦截并恢复。本轮无 Computer use，用户授权 commit 并 push 当前分支；用户体验、旧包状态仍按下文区分。

**最新补充（2026-09-27）**：`7bdd139` 复审的复制换行与启动重试问题已在源码修复，15 项测试、统一检查、生产构建及隔离 Electron 实操通过；见 [复审修复与架构核对](review-fixes.md)。下文的 `dist/s1-candidate` 仍是原 0.1.0-s1.3 包，未替换正在运行的用户试用窗口。体验本轮修复使用 `pnpm dev`；尚待用户试用认可。

更新：2026-09-27。授权仅 M1 S1；不启动 S2，不推送。实现起点 `5d4bdf6`；S1实现、反馈修复和验证投入规则调整纳入本次完整本地提交，提交标识以Git记录为准，未推送。**01–05 resolved，含用户反馈修复；0.1.0-s1.3 已修复用户报告的Markdown原文粘贴问题，待复试，尚未体验认可。** 无新的待对齐重要产品判断。

## 可操作范围

选择项目目录（Main realpath/stat/access、默认仅浏览）→ 创建一个稳定 Thread → 编辑文字/中文/换行/可编辑粘贴 → 自动保存 → 关窗重开或退出重启恢复。SQLite WAL/FULL，300ms 合并串行保存与 revision CAS；旧回执不会把新稿标为已保存。保存失败保留正文和窗口，支持明确重试或全选复制；输入法候选未完成时保留窗口。突然崩溃只保证已确认落盘内容，不承诺每次按键零丢失。

单源 token、浅/深主题、normal/compact、自有 Icon Layer 已接入。长正文只滚动编辑区，保存状态和操作入口留在当前布局。普通关窗保留 Main，重新激活/再次启动可重开；Cmd+Q 才完整退出。

S1 只支持一个前台 Thread，首次选目录后没有再次切换或完整项目/Thread 管理页。没有发送、OMP、模型、认证、附件或文件编辑。选择目录不执行项目脚本，不是工具沙箱。

## 试用

**当前包：`dist/s1-candidate/mac-arm64/d-pi.app`，版本 0.1.0-s1.3。** `dist/mac-arm64` 中的 0.1.0-s1.0 是旧验证包，不作为当前交付。当前包仅本机 macOS arm64，未签名/公证，默认 Electron 应用图标；其他平台未验收。

```sh
# 从仓库运行
pnpm install --frozen-lockfile
pnpm dev

# 当前包，使用独立试用数据目录；先正常退出其他 d-pi 窗口
D_PI_DATA_DIR="$HOME/Library/Application Support/d-pi-s1-trial" \
  ./dist/s1-candidate/mac-arm64/d-pi.app/Contents/MacOS/d-pi
```

建议依次操作：选一个项目目录 → 中文输入/换行/粘贴 → 选择、撤销/重做 → 等“已保存到此设备” → 切主题/密度 → Cmd+W 后重开 → Cmd+Q 后再启动。预期项目、Thread 和已保存正文恢复，主题密度不丢正文/编辑焦点。请反馈输入手感、布局和恢复是否符合预期；不把未反馈记为认可。

相同数据目录重开才能恢复同一草稿。独立 trial 不读取个人 OMP 配置。无环境变量启动使用 Electron d-pi userData；业务文件为 `drafts.sqlite`，迁移前备份为 `drafts.sqlite.before-v1`，日志在 `logs/main.jsonl`。不要删库解决故障。

## 工程证据与限制

完整证据见 [validation.md](validation.md)，性能原始样本在 [evidence](evidence)。

- 5 文件/13 行为测试、严格类型、Biome、设计 lint 六类反例与 token/导入边界检查通过。
- 真实 Electron SQLite、SIGKILL 事务恢复、迁移失败备份/回滚、真实锁冲突与 GUI 失败保稿/重试/关窗保护；最小及正式 macOS 包资源/内置驱动均有证据。
- 最新包恢复约22110字符、选区替换/undo/redo、浅深主题与密度保焦点；16/18/20/24 图标样例与单源 primary 三消费者传播已实看。
- 最新包 Cmd+W 保留 Main；无编辑重开/关闭保持 revision 20；Cmd+Q 进程退出码0。退出事件重入已修复，不能只凭窗口消失推断退出。
- 诊断写失败一次性原生提示与 `pnpm dev` 的 CSP nonce 启动已实看。日志不记正文、SQL、凭据、项目完整路径，原始错误机器码保留，未证实根因仍 unknown。
- 固定约21000字符输入负载：日志开/关各5轮，每轮320个可信输入事件；反馈代理 p95 为9.5/9.1ms。固定无头保存任务中位数832.04/835.04ms。短程 RSS 快照中位数519.83/519.44MiB。先导轮有抖动，所有样本保留；这些只是 S1 当前负载结果，不是 M2 多 Thread、长时间内存或公开分发验收。
- 用户提供Markdown原文后，已复现并修复双MIME下默认HTML优先丢标记、默认纯文本折叠空行的问题。0.1.0-s1.3 明确保留 text/plain 原文，475字符fixture经原生粘贴、undo/redo、SQLite落盘及重启恢复逐字一致；证据见 `evidence/markdown-paste.json`。原先缺少确定性粘贴证据的缺口已补，但不宣称所有来源兼容。S1仍不做HTML转Markdown或所见即所得排版；M2既定富内容粘贴方向不变。4MiB边界超限会显式拒绝保存。

包 `app.asar` SHA-256：`ff4d7fa70735ba7cb6458760e2666176205bbf13ad799d018d71c3a142f81fde`。已检查只包含 Main/preload/Renderer、package.json 和许可，没有 node_modules、验证入口、性能开关或数据库。

按 traceId 本地脱敏导出（不上传）：

```sh
node validation/s1/export-diagnostics.mjs "/你的数据目录/logs" "traceId" > /tmp/d-pi-trace.jsonl
```

本轮原生自动化使用 `/tmp/d-pi-s1-package-check`，保留同一 Thread 及期间文字。性能、日志失败和编辑探针用独立目录，未清理或迁入用户数据。旧包和测量窗口已正常退出或在无窗口、已落盘后停止；开发探针 Vite 服务若仍在可按其终端正常停止。后续接手先读本页和 spec，再按 S1 反馈推进，不重做已有验收，不开启 S2。

当前已为用户重新打开0.1.0-s1.3试用窗口，数据目录为 `$HOME/Library/Application Support/d-pi-s1-trial`，保留既有试用草稿，等待用户重新粘贴复试；旧版已经丢失的标记不能自动恢复。保留该窗口与数据，不把它当作可清理的性能fixture。

2026-09-27 用户要求放宽不必要的前期验证并完整commit：后续先查官方文档/固定版本源码及已有结果，只有关键未知前置实验，日常只做受影响路径检查；不机械重跑本页列出的S1证据。当前试用窗口继续保留，仍待用户复试认可。规则见根AGENTS.md与无头功能合同，S2仍未授权。
