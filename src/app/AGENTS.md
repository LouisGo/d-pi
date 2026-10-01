# `src/app` 规则

- 这里只放应用级装配、进程入口、跨领域用例和界面组合；业务事实仍由 `src/modules` 拥有。
- `main` 负责生命周期、IPC 注册和仓储/服务组合；`host` 只保留 utility 入口；`preload` 只暴露受限桥接；`renderer` 只组合视图和客户端模型。
- 不在 app 复制 OMP 队列、历史、收据或可写正文；恢复、ACK、消费和目录授权继续调用所属模块的公开能力。
- 跨模块依赖必须登记在 `architecture/modules.json`，普通内部文件不登记；结构变化后运行架构门禁和受影响行为测试。

- Router、文件路由与生成树均归 `renderer`；生产导航由注册树推导，不复制 params 类型或用断言逃逸。导航只在 AppModel 确认切换后提交，preload/loader 不执行领域命令，见[导航合同](../../docs/architecture/navigation.md)。
