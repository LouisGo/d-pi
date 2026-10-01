# 开发调试工具

2026-10-01。用户反馈会话切换仍有整页闪烁，要求在 `pnpm dev` 开启 DevTools 开关并安装官方 React 扩展。本轮只准备调试工具；闪烁根因及修复继续待定位，不以此前包内有限采样否定用户反馈。

Main 开发构建新增「开发 → 切换开发者工具」，macOS 快捷键 `⌥⌘I`。通过固定开发依赖 `electron-devtools-installer@4.0.0` 从 Chrome Web Store 下载官方 React Developer Tools，每次开发启动在创建窗口前加载，缓存存于 App 数据目录的 extensions。开发构建标识由 electron-vite 的 serve 命令定义；生产构建及 packaged 应用均无该菜单及安装行为。sandbox/contextIsolation/nodeIntegration 和 IPC 来源守卫保持既有设置。

实际 `pnpm dev` 已在本机启动，终端确认 Loaded React Developer Tools，下载版本为 8.0.0。Computer Use 在真实 macOS 窗口通过菜单打开 DevTools，确认 Components / Profiler / Suspense 入口；首次安装后 Components 一度提示未检测到 React，刷新一次后显示真实 App、RouterProvider、ApplicationLayout、ProjectThreads 组件树。此为实际扩展连接验证，不宣称首次注册完成与 loadExtension promise 完成等价；首次连接提示与刷新步骤已加入 README。

本轮未启动个人配置的 OMP 或发送真实供应商请求，未修改任何产品恢复/执行策略。已有 pnpm-lock.yaml 的 pnpm exe 记录保留。开发窗口与 DevTools 保持打开，源码改动未打包成新试用候选；m2.10 仍是历史交付身份，用户体验认可 pending。

验证：开发菜单与扩展加载各自先失败后实现；相关 16 项行为/启动测试、完整 typecheck、Biome、文档引用、架构、结构报告、状态聚合与 i18n 检查通过。生产构建输出至 `/tmp/d-pi-devtools-production-20261001`，构建通过，Main 产物未包含 installer 下载逻辑或 toggleDevTools。`check:fast` 在环境检查失败：锁文件管理器文档中的既有 `@pnpm/exe` 记录不符合检查器只接受 pnpm 单条记录的解析限制；本轮安装前已存在该记录，未通过删改它或降低门禁掩盖失败。SDK 资源准备首次被运行中的应用资源守卫拒绝，正常退出应用后 `pnpm runtime:sdk` 成功，同步新的 lockHash，随后重新启动开发应用。
