# 项目、工作目录与 Thread

日期：2026-09-27。深度：M1 身份和恢复设计；M2 多 Thread 界面；M3 worktree 管理和历史操作。依据 D-08/D-11/D-24/D-25；[领域术语](../../../GLOSSARY.md)、[基础契约 §1](../foundation-contracts.md#1-身份持久化与生命周期b1)及[权限 §5](../foundation-contracts.md#5-最小权限与信任b5)。返回[模块地图](README.md)。

## 当前工程落点（领域目录治理，2026-09-29）

- Thread/目录/执行信任合同在 `src/modules/threads/contracts/public.ts`，仓储和项目选择协调在 `src/modules/threads/main/`。
- `src/app/main/wiring/desktop-command-service.ts` 只组合 restore/choose-project/save/preferences；选择项目的并发和真实路径归 `ProjectSelectionService`，不会把选择逻辑继续堆回桌面入口。
- OMP session binding 仍是 threads 的关联事实，执行许可在每次操作前由 execution/Host 重新核对，不因缓存的 Renderer 状态获得权限。
- Renderer 由应用层 `ThreadModel` 组合完整的 controller、提交、运行与阅读资源，成功后再发布 ready；它复用 threads 的真实 `ThreadContext`，不复制 Main 身份所有权。文件/Git 查询使用该上下文隔离缓存，业务释放与编辑器解绑分开，旧 Thread 保存 lane 不转接到新 Thread。路径验证见[重写记录](../../../.scratch/rewrite-preparation/issues/05-workspace-display.md)。


## 范围与拥有者

Main 的 Thread 功能管理项目/目录关系、稳定 threadId、workingDirectoryId、原生记录引用，以及目录维度的执行信任和 App 文件授权。数据由[存储](app-storage.md)落盘，UI 只查询和发意图。选中的 Thread、侧栏展开等属于界面偏好，不代表后台执行归属。

创建草稿即有 threadId；原生引用只在证据确认后绑定。一个目录可被多个 Thread 使用，必须明确文件共享；worktree 作为独立工作目录。线程切换不复制业务状态，也不重新启动正在工作的 OMP。

2026-09-27 用户明确 worktree 行为优先遵循 OMP，GUI 必须标识当前 Thread 实际使用的 worktree。展示以真实工作目录和 Git 信息为准，提供可辨识的 worktree/分支标识与可查看的完整路径；普通项目目录也清楚标识，不仅展示项目名称。分支名不能单独替代目录身份，迁移后必须按实际结果更新关联和展示。

固定 OMP 基线已有 `/wt` 创建并迁移当前会话的行为，以及独立的 task 子 Agent 临时隔离设置；两者不能混用。后者不代表多个 App Thread 会自动分配不同 worktree。原生创建/配置/迁移机制继续复用，GUI 负责入口、实际配置和副作用表达、Thread 关联及失败恢复；不自建另一套 Git 隔离策略。源码核对与限制见[访谈第十八轮](../../../.scratch/pre-coding-interview/spec.md#第十八轮worktree-继承边界与身份展示)。本轮未改变 M2 关联已有 worktree、M3 创建/迁移/清理的既有阶段。

2026-09-27 用户确认跨 Thread 操作保护，并要求及时提醒：已知迁移后的源目录清理会影响其他活动 Thread 时，在产生副作用前阻止整项冲突操作，立即展示原因、受影响 Thread 与处理入口；解决后重新校验。不得静默修改原生配置或只执行部分步骤。检测范围限于可确认的 App Thread，不保证外部 CLI/编辑器互斥；接入时验证实际执行入口的保护，不能仅依赖 GUI 按钮检查。

## 交接

| 操作 / 输入 | 提供给谁 | 结果与边界 |
| --- | --- | --- |
| 打开项目、创建 Thread、关联已有 worktree | 输入、文件、Git、宿主 | 稳定身份与规范化工作目录；目录关联不代表获准执行 |
| 选择原生记录恢复 | 宿主、阅读 | 原生引用、配置上下文与目录；浏览历史可独立于执行启动 |
| 请求开始/恢复执行 | [配置](configuration.md)、[宿主](runtime-host.md) | 组合可用性、目录、信任、会话占用；最终操作处复核，不能复用过时的 ready 布尔值 |
| 用户授予/撤销权限 | 文件、宿主及其他实际操作方 | 更新对应目录的执行信任或文件读取范围；两者分开生效 |
| 原生身份、进程中断通知 | 存储、执行、阅读 | 绑定原生引用或标记中断；进程实例身份不取代稳定 Thread 身份 |

文件模块只取规范化资源上下文和必要授权信息；它自己在打开文件时校验实际目标。宿主启动时检查执行信任。共享授权解析逻辑可复用，但不建设规则语言或万能权限服务。

## 生命周期与失败

- Thread 跨窗口和重启存在，原生 OMP 实例按宿主规则回收；“当前未启动”不是“Thread 已删除”。
- 目录移动/丢失需要显式重新关联，不能在同名目录或 OMP 回退 cwd 下继续。只读历史的可用部分仍可呈现。
- App 内保持原生会话单执行拥有者；跨 CLI 锁尚未证实，无法确认占用时只允许查看，不自动强占。
- 新目录默认仅浏览，不启动 Agent、shell、项目扩展或语言服务。读取 Git 也不能触发外部 diff/textconv 等项目代码。
- 撤销阻止新操作；撤销执行信任时需要停止现有任务后才可显示已降级。无法收回已交给 OMP 的内容。

## 第一批交付与验证

M1 先做一个前台 Thread 的创建、草稿恢复、目录准入、原生绑定与重开；数据模型支持多 Thread，不要求先建全套管理页。M2 交付并行、切换和已有 worktree 关联；M3 再做创建/迁移/清理 worktree 与原生历史编辑、分叉、树导航。

验收至少覆盖：相同目录两 Thread 不串草稿/回执，切换前台不停止后台；旧实例结果不进入新实例；目录丢失不换目录执行；仅浏览没有项目代码加载；占用不明不追加。原生分叉创建新 Thread 并保存父关联，树内导航不新建 Thread；具体 GUI 操作到该切片核实，不定义文件回滚。
