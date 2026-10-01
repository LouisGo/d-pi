# 类型安全的桌面路由接入

2026-10-01。用户授权完整实施 TanStack Router 接入、独立 review subagent 检查并修复实质问题、分批本地 commit；不含推送或公开发布。基线 `29dc7ab`，既有未跟踪 `bun.lock` 不属于本切片。

```project-status
[{"id":"router-integration","title":"类型安全桌面路由","phase":"基建","engineering":"complete","trial":"delivered","acceptance":"pending","evidence":["issues/01-routing.md","review.md","handoff.md","evidence/native-result.json"],"next":"试用本地 macOS 候选：页签、会话切换和前进后退；用户认可待反馈","constraints":"本地实施和提交；不 push、不改变 OMP 执行及冷恢复政策。","build":"0.1.0-m2.9 / acf535c4-88948e3f"}]
```

## 推进与交接

- 交付：在现有 Electron 工作台接入类型安全的 TanStack Router，保留 Thread/编辑/查询资源所有权和已定交互。
- 范围：memory history、应用层文件路由、Thread 与阅读页签导航、导航事务边界、版本/生成/门禁、行为及类型验证。当前配置 UI 保持位置；外部深链接和新设置页面不纳入本切片。
- 重要待决：无。常规实现选择与遇到的库行为依据在本规格记录。
- 工程：完成；最新 registry 核实 Router 1.170.41、plugin 1.168.42、CLI 1.167.40。peer 声明兼容不等于实际验证通过。
- 试用：已交付[本地候选](handoff.md)；工程和 Agent 验证不替代用户认可。

## 合同与验收

1. 所有生产导航使用注册路由树的 TS 推导；目标、params、search 在 TS 服务可见。不以 `as`、`any`、宽泛字符串或重复手写路由参数类型逃逸。编译期反例证明错误路径、缺失/错误参数及非法页签被拒绝。
2. Router 仅拥有页面位置、阅读页签和内存历史；Main/Thread/AppModel 拥有选中身份与资源，Zustand 承载其展示投影，Query 继续只读缓存。供应商类型不进入 IPC/领域合同。
3. 复用冻结编辑器、flush 草稿、Main 选择确认和完整 Thread 资源发布。IME/保存失败/取消不提交导航；并发或迟到结果不串资源。部分 IPC 失败后的选择不确定必须核对，不自动重发选择命令。
4. 新建/选择项目等命令完成后定位真实 Thread；back/forward 与点击均经过业务导航检查。路由 preload/beforeLoad/loader 不执行选择、保存、启动、发送或停止等命令。
5. 同 Thread 阅读页签以 `view` search 表达，保留面板挂载、滚动、编辑器、撤销、待应用附件及查询缓存。页签 replace，Thread push，首次恢复初始化/replace。
6. 每 Renderer 创建一次 Router；使用 memory history，不改 Electron 页面加载及安全边界。窗口关闭沿用既有握手，路由不引入第二套 beforeunload 提示。
7. 生成路由树可在干净 checkout 的类型检查前显式生成。app 内部文件无需新领域模块；机器清单保持全量归属，路由运行时限定 Renderer。
8. 有意义的行为回归、编译期正反例、架构门禁、`pnpm check`、`pnpm build`，以及隔离数据的实际 Electron/打包导航验证通过。后台作用域、刷新无重发与冷恢复只读保持。
9. 每个可审查批次进行独立 subagent review，核实并修复高价值问题；最终完成一次覆盖全部改造的 review。记录真实证据及未覆盖项。

路由树首轮为 `/` 与 `/threads/$threadId`，`view` 为 conversation/files/submissions/history；没有额外的项目实体或执行 session 路由。

## 任务

| 票 | 结果 |
| --- | --- |
| [01](issues/01-routing.md) | 完整路由集成、审查及验证 |

## Comments

- 2026-10-01：现有 AppModel 的切换结果是 void；需要窄的类型化结果给导航适配，而不搬走领域副作用。Main select 后 restore 可能失败，不能把失败等同于选择未发生。


- 2026-10-01：独立审查问题均已修复，详见[审查记录](review.md)。完整 `pnpm check` 通过：475 行为测试、33 架构和 47 tooling；正在准备干净源码的实际打包导航。锁定 history 的 POP 与 core 同位置 load 行为采用窄的应用适配，不迁移领域操作。

- 2026-10-01：干净隔离源码 `acf535c` 删除生成树后完整 typecheck 重新生成字节一致，构建/打包成功；实际打包 11 项原生检查通过，2 次调用仅为隔离 localhost fixture。试用包和哈希见[交接](handoff.md)，用户认可仍 pending。
