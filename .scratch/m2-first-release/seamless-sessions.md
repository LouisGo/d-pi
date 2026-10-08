# 默认会话流程本地交付

2026-10-08。分支 `codex/seamless-session-experience`；基点 `bd98fa8`；产品源码 `d6df40a`，后续仅验证预算/证据/管理。当前用户授权为[默认流程切片](spec.md#2026-10-08-会话默认流程体验当前授权)。代码、资源和真实模型已验证；正式 GUI 复测被 macOS 锁屏挡住，不能记为已验收。M2整体与用户认可继续待验收。

## 已实现

- 打开绑定会话直接显示原生保存内容，不需要先点读取或启动 OMP。保存页接在同一时间线；生成期间继续阅读与切换会话。
- 历史与实时状态以真实 native record ID 精确合并，使用同一行组件和稳定 presentation key；原生 ID 补齐、冷种子、保存刷新保留 DOM/Range/复制焦点。正文以完整保存内容为准，实时窗口淘汰后自动只读补页。不按正文或顺序猜身份。
- 活动的已允许项目会话自动准备 OMP，首次允许直接启动；新建、返回与冷恢复复用真实工作目录的信任。失败提供重试，不自动循环启动或重发 unknown。
- 原生常规 sessions 根自动扫描，按 v3 header 的实际 cwd 整理项目与 Thread。一原生 session 一持久关联，保持文件/原生身份与当前选择；未见过的目录不自动授执行权限。256目录/4096文件是每批预算，Main游标与App生命周期自动继续，不再全局截断200条。
- 删除 worktree 不删除历史，保存内容可读，目录不可用单独表达。无绑定、文件丢失、未完成尾部、非消息数量明确区分。
- SDK 冷种子从官方 SessionManager 的 branch 取真实记录 ID，只在恢复且发送前开放，结束后关闭；大消息使用官方v2 encoder。live ID只由同一原始对象证明，未知对象转换明确gap。退出先排空已接收事件，再让SDK排空输出，保留原生dispose错误对象。

## 范围与限制

CLI-origin 导入会话只读。官方外部 CLI 尚无共享执行全周期单写协议，不能凭“当前没有看到进程”接管或复制成替代会话。App 私有原生绑定正常同ID/文件冷恢复并可继续发送。只有初次陌生实际目录需要一次明确执行信任；配置/认证沿用OMP。

原生记录 ID 证明记录身份，不证明持久写盘或工具执行成功；原生持久失败保留原官方通知。obfuscator 替换对象时不猜关联。原生磁盘写入对单个 unsigned string 有自己的截断限制；本次大消息使用官方可完整保存的多个text parts，不声称绕过原生限制。App数据采用v12元数据迁移，恢复先读旧提交收据，再备份迁移；不删除/降级重写数据库。

## 工程验证

选定原始证据位于[evidence/seamless-sessions](evidence/seamless-sessions/checks.json)，可从本地提交取回；完整执行日志保存在 `/Users/lou/Downloads/DPI_无缝会话复试_2026-10-08`，凭据不收录。

| 层级 | 实际结果 |
| --- | --- |
| TDD/React | 保存→恢复、live→原生ID→落盘的DOM/焦点/Range；完整正文、unbound回补、窗口淘汰、missing cwd均先红后绿 |
| 相关行为 | 49文件310项；SDK/Host/资源46项；目录11项（含202项目、4098文件与258bucket）；reading/dispose4项通过 |
| 真SDK 18.4.6 | 1002记录12页，2,250,080字节单条完整恢复；9个v2 chunk，最大物理帧349,618字节；user/assistant end精确关联；最后页后拒绝再次读；无模型请求 |
| 真实模型 | 独立GPT Luna两次调用，同session ID/文件冷恢复后准确回忆第一轮标记，原生文件与事件记录ID一致，工具调用0 |
| 实际Main启动 | 独立App数据自动持久整理alpha/beta两个CLI项目、schema12；没有手动建项目/Thread。此为DB证据，不能替代可见GUI |
| 类型/静态 | root/core/renderer/main/host/preload类型、Biome、设计lint/验证、i18n、交互、架构449源文件、文档326文件通过 |
| build/资源 | build通过（既有chunk-size提示）；root与QA资源均SDK18.4.6，548.4MiB，所有SDK hashes相同；588源码/脚本文件逐字节一致 |
| 独立评审 | Spec与Standards固定base…d6df40a；发现均修复并补反例，最终无剩余已证实P0/P1/P2 |

真实模型调用在 `da527d6` 对应适配器上完成；之后产品变化仅 dispose drain。`d6df40a` 已再次执行真实SDK大页/身份/关闭探针、同文件恢复与官方stop/continue验证，未为仅退出变化重复付费调用。

没有宣称完整 `pnpm check` 全绿：Corepack环境不能获取目标pnpm，改用同目录直接执行各检查。全量Vitest末次1126通过/2失败/2跳过：既有configuration-sharing验证器引用已裁剪的 `SDK/dist/cli.js`；另4098文件fixture与构建/SDK准备并跑时超20秒，单独复测通过，预算调整30秒后11项通过。全量tooling中既有“缺pnpm hook退出码”样本失败；受影响14项tooling及新增dispose4项通过。失败保留，不将源码检查当GUI验收。

## 仍需完成的GUI验收

Mac两次读取均返回锁屏且自动解锁失败；已请求用户解锁，当前没有答复。GUI试验应用使用独立数据、合成CLI记录和隔离原生配置；没有操作个人历史或改变全局凭据。启动过Dev，未取得可见AX/截图，不能写“GUI通过”。

解锁后续测：首次进入即可看到按项目组织的CLI Thread与正文；新私有Thread仅首次项目允许，随后自动就绪；第二个Thread免重复允许/启动；生成中切换/读历史不阻塞；退出再开默认显示正文并自动准备同一App私有原生会话。CLI导入应明确只读，不出现允许接管入口。保留选区/复制焦点的正式GUI补证也在本步。

日常交付为仓库 `pnpm dev`，根目录SDK已重新准备。独立复测副本路径 `/Users/lou/Downloads/DPI_无缝会话复试_2026-10-08/source`；数据路径同父目录的 `app-data`，原生配置 `native-config`（私有凭据，仅本机）。最终源/资源身份见[source-identity.json](evidence/seamless-sessions/source-identity.json)。本次未push、未创建远端PR或发布。
