# `src/app` 规则

- 这里只放应用级装配、进程入口、跨领域用例和界面组合；业务事实仍由 `src/modules` 拥有。
- `main` 负责生命周期、IPC 注册和仓储/服务组合；`host` 只保留 utility 入口；`preload` 只暴露受限桥接；`renderer` 只组合视图和客户端模型。
- 不在 app 复制 OMP 队列、历史、收据或可写正文；恢复、ACK、消费和目录授权继续调用所属模块的公开能力。
- 跨模块依赖必须登记在 `architecture/modules.json`，普通内部文件不登记；结构变化后运行架构门禁和受影响行为测试。

- Router、文件路由与生成树均归 `renderer`；生产导航由注册树推导，不复制 params 类型或用断言逃逸。导航只在 AppModel 确认切换后提交，preload/loader 不执行领域命令，见[导航合同](../../docs/architecture/navigation.md)。

## Renderer 落点

沿用 Main 按 `lifecycle` / `ipc` / `wiring` 区分职责的方式；Renderer 根只保留 `main.tsx`、`app.tsx` 和 `index.html` 入口。

| 目录 | 职责 |
| --- | --- |
| `renderer/wiring/` | AppModel、ThreadModel 与进程级 QueryClient 的装配和资源生命周期；不因路由或面板卸载释放业务模型 |
| `renderer/shell/` | 启动/空状态、应用外壳、项目导航、全局偏好与提示；订阅放到实际消费者 |
| `renderer/routes/` / `renderer/routing/` | 薄文件路由、注册树、位置/search 与导航准入；不拥有工作台资源 |
| `renderer/workbench/` | Thread 工作区、输入/文件接入、模型和执行交互；保持编辑器及四个阅读面板的挂载边界 |
| `renderer/reading/` | 实时消息、提交收据、原生历史三个独立面板与 Markdown 呈现；分别消费领域公开能力 |
| `renderer/components/` / `renderer/styles/` | 共享 UI、图标和展示映射，以及统一主题/密度 token |

测试与所属实现就近放置；内部导入使用相对路径，不增设汇总 re-export。只有应用组合留在这些目录，领域事实继续回到所属模块。

## Main 与 Preload 落点

| 目录 | 职责 |
| --- | --- |
| `main/index.ts` | 唯一进程入口，传入构建产物的 Main 目录；资源、preload 和 renderer 路径不从私有源文件深度推导 |
| `main/lifecycle/` | 窗口、关闭握手和退出的共同生命周期；菜单与受限窗口加载分开呈现，关闭/退出状态仍由 application 单一拥有 |
| `main/ipc/` | 按 draft / locale / configuration / execution / project-reads 注册 IPC，统一校验可信来源；通过 getter 读取可重试初始化后的服务 |
| `main/wiring/` | 仓储、DesktopCommandService 与 NativeConfiguration/RuntimeService 装配；跨域 runtime 集成测试在 `tests/integration/` |
| `preload/index.ts` / `preload/bridges/` | 单一受限暴露入口，内部按桥接职责分组；不暴露 Electron event、ipcRenderer 或任意 channel |

菜单和窗口呈现不拥有服务或写入事实；私有模块拆分不增加公开面，也不改变 Electron bundle 的入口文件名。
