# OMP 18.4.6 运行时加固交接

2026-10-01。从 `4d294e0e84f22477507d4b3d6df351cf71aa0d95` 实施完整 [spec](spec.md)。原 18.4.5 目标由用户明确取代为 18.4.6，并允许唯一随包 SDK prelude 导入修正；不改变 OMP 执行、工具、原生历史和配置所有权。

## 当前结果

01–05 已完成实现及有意义的目标版本验证，完整 `pnpm check` 已通过（451 Vitest通过/1既有CLI跳过，32架构、47工具测试）；06 正在干净源码候选交付。当前 App `0.1.0-m2.7`、SDK `18.4.6`、Bun `1.3.14`、App SQLite schema `6`，Node `24.21.0`、pnpm `12.8.1`、Electron `44.4.5`。产品用户认可仍 pending。

- 配置 scope/trace/source 固定，Main 从可信 Thread 解析目录，迟到或错位回包拒绝；全链只读采样不写原生根，无法安全读取的来源带 partial/unavailable。默认/off/effort使用官方 metadata/helper，五类模型真实 Host/get_state 回读。
- ACK、prompt_result、native local response 与 session settled 分离；有限身份绑定证据先提交再确认，同活重送仅证据，unknown不自动重发。schema6保存必要结果，迁移前备份，失败保留原库；未settled或未确认证据阻止正常idle回收。
- Main登记本次PID/birth/executable/parent/group/token后才许可加载SDK；真实Bun/Host/Main故障下清理受管组，单scope故障不结束另一scope。停止不依赖SQLite可写，关闭须等待实际组清理确认；不证明文件回滚或逃逸进程停止。
- 窗口内缓存脱离view的EditorState，A→B→A保留选区和有限undo/redo；消费/新revision失效，旧View迟到事件不写新View。8 Thread/4MiB正文LRU、history depth50，窗口释放不持久化undo。
- 资源先在staging完成实际包/exports/import/launcher和补丁校验，再原子替换。Main与prepare持同一资源根的SQLite互斥，覆盖验证到spawn竞争；Main退出/故障由内核释放，活跃开发App须先关闭再准备。官方安装包保持原样。

## 证据入口

- [包源/唯一补丁审计](evidence/sdk-package-audit.json)、[实际SDK文件/许可证盘点](evidence/sdk-file-inventory.json)、[环境](evidence/environment.json)。新官方tag `8b25ad4a05625dde65df41d057756b4815f4837c`；旧18.3候选保留于 `dist/m2-entry-candidate/mac-arm64/d-pi.app`，不把schema6/新版原生数据自动交旧版写入。
- [配置随包验证](evidence/configuration-packaged-18.4.6.json)：13只读场景、认证fixture、五类原生模型回读，真实供应商调用0。
- [原生结果/持久化](evidence/native-outcomes.md)：真实localhost RPC与受控原生类分别标明，完整Decoder→Host→Runtime→SQLite链、写锁/重送/重启/未知和idle竞争红绿。
- [真实进程矩阵](evidence/process-supervision.json)：Electron Main/utility/目标SDK、实际工具heartbeat、单scope隔离、SIGKILL与SQLite锁中停止，故障后收据/冷只读/原生历史事实分别记录。
- [编辑票](issues/05-editor-continuity.md)：真实React/Tiptap行为、选区/独立history/容量/版本/消费/旧View回归；原生窗口由最终包验证补齐。

## 边界

本地未签名交付，无push/公开发布/公证/自动更新。真实OpenAI/DeepSeek账户、刷新和计费请求、GUI配置来源选择、子Agent Thread覆盖、附件/完整队列编辑和完整长输出负载矩阵继续留M2原票；S3退出放弃队列仍待产品决定。冷旧会话只读，不adopt、不新建替代会话掩盖故障。macOS arm64实际验证，其他平台和脱离受管组的外部进程不在证据范围。

## 最终构建

待完成整体门禁、干净源码构建及包内受影响路径后，在此记录真实commit/buildId/dirty、包路径与哈希，工程通过和用户认可独立。
