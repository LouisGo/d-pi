# d-pi 重写前提交复盘

2026-09-30。审阅范围为 `59256015c88f528479f3787e4bb6d1a3e8903f51..4adea8299a254df56664c0b3bc00c71abcd01383` 的 32 条提交，按 Git 历史顺序核对 diff，并回查结束提交的核心实现。本文保存此前聊天中的取舍，供新会话按课题查证；执行范围、授权和实时状态以 [spec](spec.md) 为准。

这是源码与历史审阅记录，未重新运行完整回归、GUI 或性能测试。保留一条约束、用例或工程方法，不表示该 commit 的整套实现适合搬入重写。设计参考提交本身只新增领域治理规格，状态库未落实的欠账在该点已经存在。

## 逐提交取舍

| Commit | 实质内容 | 重写取舍 |
| --- | --- | --- |
| `fa2f34a` | 最小架构清单与门禁 | 保留可执行边界和正反例；检查器按实际结构取舍 |
| `de48359` | files/input/changes 迁移 | 保留职责归属与选区路径；搬目录不能证明核心模型成熟 |
| `2f81069` | 提交恢复移出通用数据库 | 保留业务所有权、恢复顺序和失败清理 |
| `06b5031` | 其余领域目录迁移 | 保留模块归属；旧服务和类不直接成为重写模板 |
| `073419e` | 全仓归属与测试边界 | 保留生产、测试和环境依赖的区分 |
| `7ea1d23` | 修正 GUI 实际操作记录 | 保留证据准确性；不升级为架构规则 |
| `05d8d59` | 阅读与执行解耦、草稿消费同事务、工具覆盖 | 重点保留合同和回归用例；环境适配细节重新评估 |
| `01744c1` | 真实负例验证工具与类型门禁 | 保留工具实际执行、实际拒绝违规的验证方式 |
| `663fb0e` | integration 测试边界 | 保留；跨模块测试不制造生产依赖 |
| `216ef85` | 历史适配边界分类工具效果 | 保留 mutation/no-mutation/unknown；UI 不猜修改归属 |
| `c1aafee` | 收紧依赖清单、区分行数提示 | 保留报告原则；新增报告测试尚未进入标准测试入口 |
| `a8bd340` | 宿主监督事件与原生事件分离 | 保留边界；相关超时不伪装成 OMP 原生事件 |
| `1c55225` | 编辑器卸载、重挂载与迟到 ACK | 保留行为用例、身份绑定的 detach 与延后消费 |
| `5068fa0` | 删除旧 editor replacement 路径 | 保留单一路径；不为测试维持第二套生产接入 |
| `8fd36a7` | Runtime 结构化错误贯通 | 保留原因、语义消息和 trace；命令错误与 Runtime 事实重新分工 |
| `5f811fb` | 集中原生事件名称 | 保留未知事件兼容；名称包装不等于 payload 类型已完善 |
| `8a6e972` | 显式存储初始化 | 保留顺序和清理；公开两段式初始化重新设计 |
| `c157476` | 显式比较提交目标字段 | 可借鉴四个身份字段的直接比较，避免泛化反射 |
| `90c360f` | Main IPC 注册拆分 | 保留装配与操作处理分离、窄依赖 |
| `9c908e2` | lint 缺失或崩溃时明确失败 | 保留；工具没跑不能报告检查通过 |
| `14c1e55` | 拒绝原因贯通持久收据与 UI | 保留事实链；收据/事件类型进一步表达字段关系 |
| `8498c09` | 初始化守卫、读取合流和迟到回复 | 保留迟到回复用例；初始化 API 与读取日志抽象重做 |
| `5e0d87d` | rejected 终态与原因回归 | 保留单调性用例，不要求复制实现形状 |
| `4b6d0db` | D-37 恢复两库为基础设施 | 必须作为重写起点依据；保留真实确认日期与取代关系 |
| `32807ca` | Zustand/Query 接入 | 保留实际接入方向；首次迁移只是起点，不能原样视为范式 |
| `05f2b51` | 如实记录 GUI 验证受阻 | 保留证据分层，不把源码检查当 GUI 验收 |
| `5b08895` | 归档失效脚手架清理 | 保留原始证据与追溯方法，失效应用脚手架无需带回 |
| `1204319` | 文档漂移与 skill 入口修正 | 保留 frontmatter、路径含义和当前结构依据 |
| `757418c` | 规范单源与产品术语去重 | 保留合同、skill、工作记录的职责分离 |
| `1e615fb` | useStore、细粒度订阅、queryOptions、dispose | 保留语义；实体查找成本和生命周期模型继续打磨 |
| `e4a31d8` | 重试、刷新状态和根路径 key 修正 | 保留行为用例；局部修复不能变成无条件规则 |
| `4adea82` | state/query skill 发布 | 保留按需入口和示例组织；校正过度概括后再使用 |

## 回归依据与现有入口

以下路径对应审阅结束提交，均相对仓库根。后续文件移动时可通过 `git show 4adea8299a254df56664c0b3bc00c71abcd01383:<路径>` 查原始用例；本文保留历史路径，现行落点由模块地图和实施票维护。

| 关键行为 | 审阅时已有入口 | 重写必须保留的语义 |
| --- | --- | --- |
| 提交持久化、恢复与消费 | `src/app/main/submission-storage.test.ts`、`tests/integration/submission-coordinator.integration.test.ts` | 派发前持久化；ACK 与草稿消费同事务；保留原文，不覆盖更新后的草稿；执行恢复顺序不变 |
| unknown 与旧实例 | `tests/integration/prepared-recovery.integration.test.ts`、`tests/integration/submission-coordinator.integration.test.ts` | 旧实例不能 ACK；写入结果未知保留内容；恢复 prepared 不自动派发 unknown |
| 编辑器接入 | `src/modules/execution/renderer/submission-model.test.ts`、`src/modules/input/core/submission.test.ts` | 未附着时延后消费；旧 cleanup 不移除新 adapter；新编辑及 IME/撤销语义不受迟到 ACK 破坏 |
| 拒绝原因与终态 | `tests/integration/submission-rejection-reason.integration.test.ts`、`src/modules/execution/renderer/submission-model.test.ts` | 原因贯穿；缺原因的既有合法记录兼容；终态不因迟到事件回退 |
| 监督与原生投影 | `src/modules/execution/host/session-host.test.ts`、`src/modules/conversation/host/scope.test.ts` | 宿主关联超时与原生事件分离；投影不由视图/端口附着拥有生命周期 |
| 状态与查询 | `src/modules/conversation/core/subscription.test.ts`、`src/modules/execution/renderer/runtime-model.test.ts`、`src/modules/files/renderer/queries.test.ts`、`src/modules/changes/renderer/queries.test.ts` | 稳定快照和选择器；旧回复不覆盖新状态；资源身份隔离；本地离线仍读；采样失败与业务结论分别处理 |
| 门禁本身 | `tests/architecture/check-architecture.test.mjs`、`tests/architecture/tooling-coverage.test.mjs`、`tests/architecture/design-lint-gate.test.mjs` | 负例实际失败；工具崩溃不能假通过；迁移后的源码被工具实际覆盖 |

已有用例只证明它覆盖的行为，测试名称不能替代源码和断言检查。改写实现时可以重组测试；新增目标缺口遵循项目 TDD，已有正确行为补测不伪造红灯。不机械锁住旧方法名、类结构或完整 JSONL。

## 重写时需要主动改善的实现问题

- 存储先公开半初始化对象，再逐 getter 防御：改为成功完成初始化后发布可用实例，保留内部恢复顺序及清理。
- 一个宽泛 Command 对应所有 Reply：在边界保留命令与结果关系，减少内部重复错误分支。
- store 的 ready 与可变实例字段分别决定 UI 可用性：明确准备完成的含义与资源拥有者。
- 收据 state 与可选原因只是平铺字段：表达有效组合，保持旧合法记录兼容。
- 原生事件 helper 只收窄名称：在实际消费边界解析所需 payload，未知事件保持开放。
- 逐行订阅每行重复 `find`：评估热路径实体索引，保留未变引用；O(n²) 是源码复杂度判断，尚无性能实测。
- `recordRead` 在 await I/O 之后连续记录 received 与终态：恢复真实操作时序，请求挂起前已有起始证据；抽象不能丢掉因果信息。

阅读日志时序和报告测试入口有可直接行动的缺口；其余结构问题按实际需求与行为测试改造，不把偏好当作已证实故障。

## Skill 校准的已核实边界

锁定版本为 Zustand 5.0.15、TanStack Query 5.104.0、TypeScript 7.0.2。此前在临时目录做过严格编译验证：普通 `createStore<State>()` 可用，selector middleware 的初始函数标注返回值 `State` 也可保留所需订阅重载，不要求唯一使用完整 `StateCreator` 泛型。

此前用安装版本的 QueryObserver 验证禁用查询：无缓存为 pending/idle，有缓存可为 success 且 `isPending` 为 false。项目执行命令沿用协调器来自 D-24，不应把选择理由写成所有 Mutation 必然重发。这些小验证用于校准论断，尚未作为正式回归测试入库；进入对应改动时验证有意义的实际行为。

事实所有权、授权与执行范围继续由现行合同及 spec 决定。已确认方向不能被临时工程注释悄悄取代，修复经验也不能未经条件核实升级为永久规范。
