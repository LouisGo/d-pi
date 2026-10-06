## Summary

当前点击目标使用手形指针，非正文界面也能误选文字。本次统一点击目标为 `cursor: default`，通过共享按钮、icon、链接和折叠标题的 hover/active/selected/disabled/focus-visible 表达交互；默认禁止选择，明确开放正文、输入、代码、文件/Diff 与诊断内容。

中央样式覆盖第三方控件和 body 级 portal；保留 text/resize。新增静态门禁并接入快检与完整检查，阻止重新引入 pointer、分散的文本选择例外及未接入共享状态的原生按钮。规格见 [.scratch/interaction-policy/spec.md](.scratch/interaction-policy/spec.md)。

## Evidence

- 增量基线：`31cb91229852d8c6dfabb6e88fce06e78cbf6030`（`codex/m2-lifecycle`）；只纳入本次修改。
- 门禁先拦截 4 个 pointer 声明及 6 个未接入共享状态的原生按钮，修复后通过；正反例覆盖 CSS/工具类/静态命令式样式。
- 独立 worktree：`pnpm check`、`pnpm build` 均 exit 0；120 个应用测试文件、711 项测试通过，2 项既有跳过。
- `pnpm validate:interaction` exit 0：真实 Electron/正式 App 和组件，覆盖拖选、原生 Monaco 选区、Diff resize、控件后代、portal、四种主题/密度及视觉交互状态。桥接使用 fixture，无真实供应商认证/执行；未重打包安装包，用户试用尚未认可。
- 原始证据：[完整检查](.scratch/interaction-policy/evidence/worktree-check.log)、[构建](.scratch/interaction-policy/evidence/worktree-build.log)、[原生结果](.scratch/interaction-policy/evidence/native.json)、[迁移记录](.scratch/interaction-policy/evidence/migration.json)。
- [双轴独立评审](.scratch/interaction-policy/review.md)：Spec 发现的文件采样正文选择遗漏已按原生红→绿修复并复核，Standards 无实质发现。四组主题/密度验证 cursor/select，视觉状态验证 dark/compact。

## Merge Danger

Two-way door：改动影响全应用指针、控件反馈和选择策略，无数据库迁移、权限变化或外部业务副作用；可 revert 本次提交回滚。中央选择规则新增内容区域时需显式登记或使用 `data-selectable`；第三方 UI 升级需复跑原生专项，静态扫描不证明任意动态 JS 数据流。当前最小 Monaco 未注册可见 context menu，不冒称已验证该菜单。保留 Draft 待 CI 和试用，merge 不代表用户认可。
