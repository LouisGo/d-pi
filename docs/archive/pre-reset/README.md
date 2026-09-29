# 清理前设计与原型原始记录

来源提交：`6fab3efd0526d2d716d7939b75202a88f857078a`。本目录保留该提交的 `docs/prototype/` 原稿、`.scratch/omp-gui-m1/` 的访谈决策、规格、接入研究与机器结果，共 26 个文件（不含本 README 与 manifest），路径与 SHA-256 见 [manifest.json](manifest.json)。保留文件与源提交逐字一致，可随时按 manifest 复核；2026-09-30 裁剪前后各核验一次，当前 26/26 通过。本目录内不添加注记、不改写原文，裁剪与注记只写在本 README 中。

这是历史证据，不是当前实现、依赖选择或待执行指令。原文的“当前”“已安装”“立即实现”等均指当时；嵌入的上游文档与源码也是固定版本阅读快照。旧命令、临时目录和依赖可能已经不可用。

## 2026-09-30 精准瘦身

按用户决定移除 23 个无引用文件，理由均为“无仓库文档引用”：

- **旧应用源码 `src/**`（11 个）**：已被当前 `src/platform/omp/protocol/` 等实现取代，包括旧 `frame-decoder`。
- **与当前真实配置同名的顶层构建文件（6 个）**：`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tsconfig.json`、`electron.vite.config.ts`、`components.json`。它们与现行同名文件内容不同，是主要的歧义来源。
- **不可运行的原型脚本（6 个）**：`rpc-ui-probe.cjs`、`main.cjs`、`host.cjs`、`preload.cjs`、`interaction.ts`、`.gitignore`。其运行依赖的旧依赖树已不存在。

被移除文件的路径、SHA-256、字节数与移除理由保留在 manifest 的 `pruned` 段，可用 `git show 6fab3ef:<原路径>` 逐字取回。移除的是可重建脚手架，不是证据：结果 JSON、研究快照与决策记录全部保留。

## 阅读入口

- [前端库雷达原稿](docs/prototype/frontend-library-radar.md)、[V1 架构原稿](docs/prototype/v1-architecture-draft.md)、[交接原稿](docs/prototype/handoff.md)。
- [M1 访谈决策](.scratch/omp-gui-m1/decisions.md)、[M1 完整规格和验收条件](.scratch/omp-gui-m1/spec.md)。
- [接入研究与限制](.scratch/omp-gui-m1/research/findings.md)、[上游快照来源](.scratch/omp-gui-m1/research/README.md)。
- [原型说明](.scratch/omp-gui-m1/prototype/README.md)、[基础结果](.scratch/omp-gui-m1/prototype/result.json)、[排队与干预结果](.scratch/omp-gui-m1/prototype/rpc-ui-queue-result.json)、[停止后 follow-up 结果](.scratch/omp-gui-m1/prototype/rpc-ui-stop-followups-result.json)。

## 使用边界

原文相对路径按旧仓库布局保存；为保持原始文件哈希，本目录不改写原文失效链接或历史状态。文中指向已裁剪路径的相对链接不再解析，需要原文时用 `git show 6fab3ef:<原路径>` 或[固定提交](https://github.com/LouisGo/d-pi/tree/6fab3efd0526d2d716d7939b75202a88f857078a)读取。

当前有效结论与取代关系见[整理后的交接](../../prototype/handoff.md)、[架构](../../prototype/v1-architecture-draft.md)和[选型记录](../../prototype/frontend-library-radar.md)。用户已选择保留旧基线证据并逐项复用，不直接恢复旧 UI 为当前产品。不会自动执行旧实验。
