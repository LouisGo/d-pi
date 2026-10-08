# 日常状态与导入呈现证据

2026-10-08，固定 base 2fdeab2，源码 6b39d19。所有命令执行于 /Users/lou/.codex/worktrees/composer-quality/d-pi；Node24.21.0/pnpm12.8.1，PATH /tmp/dpi-composer-node:/tmp/dpi-composer-tools。

- red.txt：当前基线上首先追加6个行为反例，实际6失败/32通过。
- first-green.txt：对应修复后2文件38项通过。
- regression.txt：最终 `pnpm exec vitest run src/modules/input src/app/renderer/workbench src/modules/ui/renderer/focus-visibility.test.ts src/app/renderer/wiring/thread-model.test.ts`，39文件302项通过。fixture桥接，无GUI、provider/Host执行。
- typecheck.txt：完整 `pnpm typecheck` 通过。
- check-fast.txt：工具版本、Biome、interaction、文档引用、模块边界、structure/status报告通过。structure只更新源码hash/行数，无依赖边变化。
- build.txt：`pnpm build`通过，chunk大小与路由循环依赖提示保留。
- impeccable.json：指定Composer/工具栏/导入UI源码检测[]，不能作为视觉证明。

`pnpm lint:design`与`pnpm lint:i18n`分别通过。第一次未给第二条pnpm命令保留PATH导致本机自动版本切换ENOEXEC，已用固定工具重新执行；没有改全局环境或将该错误计作代码问题。完整check未执行，既有SDKPDF/CLIfixture失败仍未定位。用户实机自测，不存在本轮新增GUI截图或IME证明。
