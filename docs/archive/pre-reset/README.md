# 清理前设计与原型原始记录

来源提交：`6fab3efd0526d2d716d7939b75202a88f857078a`。本目录恢复该提交的完整 `docs/prototype/` 与 `.scratch/omp-gui-m1/`，以及清理提交删除的全部应用源码、测试和构建文件，共 49 个文件。它们逐字保留，路径与 SHA-256 见 [manifest.json](manifest.json)。

这是历史证据，不是当前实现、依赖选择或待执行指令。原文的“当前”“已安装”“立即实现”等均指当时；嵌入的上游文档与源码也是固定版本阅读快照。原型脚本保留用于追溯，没有在此次恢复中运行；旧命令、临时目录和依赖可能已经不可用。

## 阅读入口

- [前端库雷达原稿](docs/prototype/frontend-library-radar.md)、[V1 架构原稿](docs/prototype/v1-architecture-draft.md)、[交接原稿](docs/prototype/handoff.md)。
- [M1 访谈决策](.scratch/omp-gui-m1/decisions.md)、[M1 完整规格和验收条件](.scratch/omp-gui-m1/spec.md)。
- [接入研究与限制](.scratch/omp-gui-m1/research/findings.md)、[上游快照来源](.scratch/omp-gui-m1/research/README.md)。
- [原型说明](.scratch/omp-gui-m1/prototype/README.md)、[基础结果](.scratch/omp-gui-m1/prototype/result.json)、[排队与干预结果](.scratch/omp-gui-m1/prototype/rpc-ui-queue-result.json)、[停止后 follow-up 结果](.scratch/omp-gui-m1/prototype/rpc-ui-stop-followups-result.json)。

原文相对路径按旧仓库布局保存；本归档保留旧应用代码、package、锁文件和测试；其他未归档路径可从[固定提交](https://github.com/LouisGo/d-pi/tree/6fab3efd0526d2d716d7939b75202a88f857078a)或 `git show 6fab3ef:<原路径>`读取。为保持原始文件哈希，本目录不改写原文失效链接或历史状态。

当前有效结论与取代关系见[整理后的交接](../../prototype/handoff.md)、[架构](../../prototype/v1-architecture-draft.md)和[选型记录](../../prototype/frontend-library-radar.md)。用户已选择保留完整旧基线、逐项复用，不直接恢复旧 UI 为当前产品。不会自动执行旧实验。
