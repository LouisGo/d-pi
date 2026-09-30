# d-pi 核心重写试用交接

2026-09-30。当前授权、工程状态、用户试用与继续边界由 [spec](spec.md) 维护；本页是本次构建快照。工程完成并交付待试用，未记为用户认可。

## 构建与启动

正式产物：`/Users/lou/Learn/d-pi/dist/mac-arm64/d-pi.app`。版本沿用 `0.1.0-s4.0`；源码提交 `441b27b42e68cdc155ef30d2f6fc05ce821ae072`，实际构建 ID `441b27b4-1525b713`，`dirty=false`。macOS arm64、未签名，默认 Electron 图标；不属于公开发布。

`Contents/Resources/app.asar` SHA-256：`4fce57efd0cd44fd2c1892be8ffd96a8d86658593770bb41fdd1f6f6204b1458`。验证时复制到带空格路径，复制件与上述正式产物的 asar 哈希一致。[实际构建与结果](evidence/package-result.json)。

使用独立 App 数据目录试用：

```sh
env -u ELECTRON_RUN_AS_NODE \
  D_PI_DATA_DIR="$HOME/Library/Application Support/d-pi-rewrite-trial" \
  /Users/lou/Learn/d-pi/dist/mac-arm64/d-pi.app/Contents/MacOS/d-pi
```

这个目录只隔离 App 数据；OMP 配置和认证仍按启动环境发现。首次使用新的 App 数据目录，从“选择项目并创建草稿”开始，选择可接受执行的项目，明确允许执行后启动随包 OMP。复用已有可用模型配置，不另装全局 OMP。开发环境的准备与启动顺序见 [README](../../README.md#环境准备与启动)。

建议核对这段完整体验：

1. 起草、切换发送快捷键并用实际中文输入法输入；已组合的候选文字不应误发。保存后关窗再打开，正文应保留。
2. 允许项目执行并启动，空闲时发送 A，发送后继续输入 B；A 的回执不应清掉 B。等空闲后追问，沿用同一个存活原生会话。
3. 在文件或 Git 当前差异的对应一侧选择正文并附入输入；核对来源、版本、行列和原文。文件随后被外部修改或刷新，不应改变已经附入的内容。语言、主题、密度切换应保留编辑器内容。
4. 查看回复、代码和原生工具结果证据；当前 Git 差异只说明工作区状态，不冒充 Agent 修改。查看提交原文和原生历史。

窗口重载会重新接回存活业务；完整 App/Host 故障后的冷恢复仍只读。重新打开已有绑定的 Thread 后可读历史、编辑草稿和查看文件，不会自动重发 unknown，也不会偷偷新建替代原生会话。当前没有冷恢复后继续执行的承诺。

## 实现结果

- 初始化只发布已完成迁移、执行恢复和仓库构造的 AppStorage；异常回滚和关闭归属集中，避免半初始化资源可用。收据按合法变体表达，调用 ACK 与后续执行结果分别保留；旧原文、新草稿、重试身份和事务顺序不混淆。
- 一个 ThreadModel 拥有完整 controller、执行/提交/阅读资源。应用先构造再发布，异步回复核对真实请求代次；旧保存闭包、IME/附件回调和编辑器清理不会借用新 Thread。视图卸载不停止业务。
- 展示状态使用 Zustand；实体顺序和索引是同一投影的派生结果。文件/Git 共用 Query 工厂，key 表达 Thread/workspace/目录和路径/scope，未选择的 hook、命令式 fetch 和 refetch 都不发读取 IPC。本地离线读取、业务 unavailable 和采样错误分别处理，错误保留 trace、原 reply 和 cause。
- files 按挂载 model 的原文、来源和版本冻结 UTF-16 选区，准确处理 CRLF/CR/LF；失效回调不发布。input 的 DOM 预览显示正确行数，持久节点、草稿和发送原文保持原字节。
- 跨进程命令与结果保持类型关联和边界校验；只验证原生消费点需要的字段，未知事件与额外字段仍开放。读取 received 在 I/O 前、终态在实际结束后；Host 生命周期与提交结果分开记录。
- 高频文档迁到现行产品/架构入口，旧路径保留短跳转；状态留在所属 spec。state/query skill 的库事实有条件且指向验证后的入口。机器检查覆盖本地文档引用、真实环境、架构边界和生成报告新鲜度，测试使用隔离环境。

主要本地波次：`5d3e6b4` 计划基线；`f2a045c` 文档迁移；`f62beca` 工程入口；`d9a991a` 初始化；`a52d066` 收据；`03c1f2f` 准确选区；`0ae6589`/`4f9a404`/`c7af51e` 桥接与诊断；`57eaa48` Thread/查询/编辑器；`234e7fb` 验证后范式；`f5e998f` 正式包入口；`441b27b` 可见预览补修。小型类型/工具补修见 Git 历史。本次所有提交均本地完成，未 push。

## 验证与证据

| 层次 | 实际结果与证明范围 |
| --- | --- |
| 目标 TDD | 初始化、合法收据、身份/资源代次、未选中显式读取、准确选区、payload 消费与诊断均先暴露目标失败再修复。GUI 新发现的 CR 预览问题有 [真实红灯](evidence/reference-preview-red.txt) 与 [绿色回归](evidence/reference-preview-green.txt)。既有正确行为的绿色补测未冒称历史 TDD。 |
| 完整工程入口 | [pnpm check](evidence/final-check.txt)：343 项 Vitest 通过、1 项原生 opt-in 跳过；27 项架构 + 10 项工具 Node 测试通过，六套 tsc、Biome、设计/i18n、文档、架构与生成快照检查通过。日志中的预期 FAIL 是门禁负例，其测试均通过。 |
| 干净环境 | 独立新目录和全新 pnpm store 联网冻结安装、准备 Electron/SDK、check、build 和真实开发态启动通过；未借用主 checkout 资源或全局 OMP。[环境、首轮失败与重试](evidence/clean-environment.json)。该导出目录无 Git 身份，unknown-dirty 构建只作工程证据。 |
| 工具与构建 | [真实环境](evidence/final-environment.txt)：Node 24.21.0 / pnpm 10.5.2 / Electron 44.4.5、内嵌 Node 24.21.0 / Bun 1.3.14 / 官方 OMP 18.3.0。先完整 `package:mac` 验证工程入口；Renderer 补修后校验资源并复用同一 SDK，执行 [build](evidence/final-build.txt) 和 [electron-builder](evidence/final-packaging.txt)。构建的依赖注释/分包体积警告与未签名提示保留，不冒称零警告。 |
| 独立审阅 | 第一轮冻结核心发现收据变体和工具 start 开放字段消费两项缺陷，均按 TDD 修复。第二轮 31/31 冻结文件哈希匹配，93 项既有测试和两项独立构造失败/迟到 prepare 负例通过，无新可证实缺陷；审阅没有替代 GUI。 |
| 官方 SDK | 固定、未修改的 18.3.0 实际运行：stop 保留队列，较新 stop 压过 continue，同 session 显式继续只消费一次；缺模型预检产生同 ID 的 ACK 后失败且 provider 未被调用。生产 Decoder/投影回放记录见 [SDK 证据](evidence/sdk-boundary.md)。 |
| 正式包与 GUI | [实际退出码 0](evidence/final-package.txt)。迁移 v1 数据、两轮同 session、真实写工具、ACK 清稿、阅读/历史、文件与 Diff 混合换行选择、外部刷新后冻结原文、Renderer 重载、语言保留编辑器、主题/密度均通过。CDP 引发真实浏览器 compositionstart/end，组合期间点击发送没有收据或 provider 调用；不等同于系统输入法候选界面验收。 |
| 真实中断与冷恢复 | 第三次提交 ACK 后终止该原生子进程，原收据保持 acknowledged，outcome 变 unknown；同 trace/request/target 可回查，Host exited 独立记录。冷重开同原生绑定，无新 writer，provider 调用数仍 4；历史、草稿和文件可访问。[实际 trace](evidence/package-interrupted-trace.jsonl)、[Main 全记录](evidence/package-main.jsonl)。 |
| Agent 冷启动 | 五组原题、独立新上下文及隔离目录；正确性、成本、失败/波动和环境差异见 [同题结果](evidence/cold-start-results.md)。评测产物只存证据，不搬入生产实现；未证明普遍效率提升。 |

主 Agent 查看过 [选区预览](evidence/package-files.png)、[浅色](evidence/package.png)、[深色与紧凑密度](evidence/package-dark.png) 和 [冷恢复](evidence/package-cold-recovery.png) 四张最终截图。截图显示的模型和项目都是 fixture。

## 未覆盖与继续边界

真实供应商认证/故障、个人扩展、macOS 输入法候选窗与输入手感仍待用户试用；本地 provider fixture 的成功不替代这些验收。未验证 Windows/Linux、其他 CPU 架构、签名公证、M2 长输出或大编辑性能，也没有据此开启 S5/M2。

固定 SDK 的执行全周期单写证据仍缺，冷恢复只读；unknown 不自动重发。S3 的 [09 退出出口](../m1-s3-control-recovery/issues/09-quit-discard-decision.md) 继续延期：停止会保留并暂停队列，当前没有“放弃剩余输入后正常退出”的动作；取消退出、显式继续并等队列完成只适用于愿意继续执行的情况。刷新失败保留旧采样的体验差异沿用 [state/query 交接](../state-query-alignment/handoff.md#未覆盖与风险)，仍待用户确认，未自行改成清空。

历史分页、模型/配置等其他只读查询仍按功能接入，不为基础设施名录扩展功能。许可证、公开分发范围及版本升级序列仍需单独确定。本轮交付不构成这些授权，也不将当前代码形态自动升级为最佳实践。
