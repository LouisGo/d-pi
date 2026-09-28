# S2 前 S1 巩固

日期：2026-09-28。状态：实现与自动验证完成，新增区域的视觉体验待用户试用。

用户要求结合「评审架构与技术选型」问答巩固项目，再推进 S2。该问答是待核对的评审输入；结论以当前源码和测试为准。本轮授权 S1 必要修复、测试与交接，不启动 S2，不提交或推送。

## 目标与决定

- 保持 D-02/D-29/D-32–35 的技术栈、所有权与分层，不建立通用恢复框架。
- 用户本轮明确确认：保存未知时只读核对同一 Thread，保留当前输入；证据一致可恢复保存，不同内容展示双方供显式选择，未选择前不覆盖。
- 用户本轮明确确认：正文上限为 UTF-8 4 MiB；提前提示、保留超限正文，缩减后可继续保存；已有大草稿仍可读取。
- 确定缺陷：preload 取消关闭回调隔离；迁移备份必须包含 WAL 已提交数据；受限跨层诊断；可识别构建身份。
- 验收：TDD 针对性回归，真实 SQLite 内容恢复，统一检查与生产构建。自动化不冒充真实 GUI/用户认可；不重复完整性能与打包矩阵。

## 推进与交接

已完成下列实现与针对性验证。S1 仍待用户体验认可，原试用包不自动替换。S2 继续按原计划，不前置完整队列 GUI；提交冻结/接受交接、随包 Runtime/信任边界属于 S2。队列暂停原因与消费竞争在适配时先核对证据，仅影响架构选取的关键未知提前最小验证，其余 S3/M2 按原范围推进。


## 实施结果

1. `DraftController` 保留最后确认正文和最后尝试保存的不可变快照。核对只读恢复结果中的同一 Thread/workspace/目录：revision 与尝试正文一致，或已保存基线完全未变化，才恢复单写序列；后续输入不被旧回执清理。不同内容进入 conflict，禁止自动写入，明确选择当前稿仍用 CAS。载入已保存稿同步编辑器和保存基线，并保留为一次可撤销编辑；IME 组合中拒绝替换。
2. 恢复复用受限 restore 通道，但不走 `AppModel.accept()`，避免只更新外部快照、不更新控制器，或重建编辑器丢掉未保存正文。核对失败、外来身份、核对期间输入、确认旧写后不重复写均有回归。存储持续不可用时仍不允许丢稿关闭，可全选复制；没有新增无提示放弃或自动导出行为。
3. preload 包装取消关闭 listener，去除 Electron event，并用同一 wrapper 注销。
4. 迁移前用 SQLite `VACUUM INTO` 创建一致快照，完成后才 rename 到备份路径。源连接同步级别 FULL；未完成的临时输出不替换旧备份。保持 node:sqlite 和同步初始化边界，没有引入 ORM 或异步初始化框架。该算法保存显式业务身份，不承诺保留隐式 rowid；当前表不以隐式 rowid 定义身份。
5. UTF-8 4 MiB 在纯工具文件定义，Renderer 即时提示、Main 最终拒绝超限写并保留原 trace；旧草稿读取不加新限制。UTF-8 大小不等于 JSON 传输大小，也不是已验收编辑负载；沿用约 2.2 万字符的既有性能证据，未声称 4 MiB 输入体验已测。
6. preload 自动记录 initiated / confirmed / acknowledgement-failed，校验回执形状及命令、threadId、revision 或偏好关联；错误和正文不进入诊断。Main 验证来源 frame 和严格事件白名单，使用原异步有界 Writer。`observedAt=preload` 标识观察位置，日志 process/instance 仍是落盘 Main；confirmed 只表示桥接已核验返回，不证明 DOM 已呈现或 OMP 已接受。日志设施失败不改变业务结果。
7. 每次构建注入统一 version/commit/dirty/build ID，侧栏、启动失败页和日志可核对，脱敏导出保留该字段。源码直接测试明确标为 unbundled，不冒充发行构建。保留 0.1.0-s1.3 版本号，用不同 build ID 区分产物；未覆盖旧包。
8. 修正两个入口仍称“尚未实现”的过时文字，并把 S2 提交交接、正式 Runtime/信任、队列消费竞争及暂停原因写入近期计划。

备份方案依据 [SQLite VACUUM INTO](https://sqlite.org/lang_vacuum.html#vacuum_with_an_into_clause)，是官方提供的一致快照备份方式。桥接隔离依据 [Electron ipcRenderer.on](https://www.electronjs.org/docs/latest/api/ipc-renderer#ipcrendereronchannel-listener)。外部问答建议 `backup()`，本轮选择等价目的的 SQLite 快照能力，避免改动整个初始化生命周期；已在当前 Electron 中实测。

## 验证与实质限制

- 红灯→绿灯：preload 事件参数泄露、备份缺 WAL 最新正文、中文/emoji 字节边界、超限输入恢复、未知写核对、冲突选择、恢复后正常关闭、回执诊断与来源校验、构建字段。新增接口首次红灯包含“恢复方法尚不存在”，不称为旧实现已有方法的逻辑反例。额外既有行为防护样本直接通过，不伪造红灯。
- 最终 `pnpm check` 通过：严格类型、Biome、设计 lint/六类反例、token/导入边界及 8 文件/33 项测试；`pnpm build` 和 `git diff --check` 通过。
- Electron 44.4.5 / Node 24.21.0 的真实 SQLite：旧读事务占用时，备份读出 revision 2 和最新已提交正文，integrity_check 通过；不只是检查文件存在。
- 隔离 Electron 使用生产 Renderer/preload 和实际 DraftStorage/DraftService，测试 Main 外壳故意破坏一次保存回执；实际进入核对/对照，分别完成“保留当前输入并保存”和“载入已保存版本”。输入通过 DOM 驱动，不冒称原生 IME/剪贴板复验。生产 Main 来源/日志/关闭检查由独立自动测试覆盖。
- 主题/密度真实切换到 dark/compact，双方正文保留，computed style 对齐 token，1120px 视口无横向溢出。capturePage 持续返回 UnknownVizError，停止重试；这些 DOM 证据不替代视觉检查，新增区域外观仍待试用。
- Renderer JS 为 577.48 kB；将字节计算与 schema 解耦后，去掉本轮意外带入的 Zod（中间构建 668.30 kB）。仍有既有 >500 kB 提示和 Zod 注释提示，不把包体积当成性能实测。
- 机器摘要见 [hardening.json](evidence/hardening.json)。临时脚本、SQLite 和 DOM 布局记录在 `/tmp/d-pi-hardening.UhUneg`；测试已退出。没有修改用户试用数据、没有 Computer use、没有新产品依赖、没有 commit/push。

## 试用交接

源码/生产 out 已更新，现有 dist 试用包仍旧。可在仓库运行 `pnpm dev`；本机若 Corepack 下载受阻，可用已安装的 `/opt/homebrew/bin/pnpm dev`。侧栏显示本次启动对应的构建 ID；开发模式重启会生成新 ID。

正常输入、粘贴和自动保存应保持原行为。发生未确认保存/版本冲突时，点“核对保存状态”：可确认的保存恢复后继续保存新输入；不同内容可展开对照并显式选择。载入已保存正文可 ⌘Z 撤销；超限正文不截断，缩减后自动保存。请试用新增对照区在浅/深主题和 normal/compact 下的可读性与操作感受。用户认可仍未取得。
