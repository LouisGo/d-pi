# M2 文件与目录引用交接

2026-10-06。[04c](issues/04c-project-reference-search.md)完成用户授权的三项优化，本地 clean `0.1.0-m2.15 / 31cb9122-865978d1` 候选交付待试用。M2整体 engineering in-progress / trial delivered / acceptance pending；父04/05/06未完成范围继续保持。源于已合并工作流 main c8dbdba 的当前本地分支，无 push/远端PR。

## 本段结果

`@@virtualList` 查询保留名字内部的 `@`，匹配的 `@virtualList` 文件夹优先于其后代文件；扫描有界完整快照后取top100，不先截100个后代。候选有Folder/File图标、类型文字、目录尾斜线；文件/目录typed身份贯穿DTO、Main manifest、编辑节点与冻结来源。目录引用发送时冻结直接条目清单（名称/类型），不递归读取所有正文，沿用固定OMP18.4.6源码语义；超过500直接条目明确失败并保留输入。

Main持有可丢弃索引：同项目singleflight、最多3项目LRU，50,000访问/4,194,304个UTF-16 code unit（原路径/名称及匹配副本共同计数）/深度64/构建及最终校验5秒，最先达到的预算生效。TTL30秒按下一次查询刷新，正式“刷新搜索”入口可立即失效。Node Dirent流式读取避免逐文件lstat；只排除.git/node_modules，不遍历symlink。目录读前后及最终已采样目录dev/ino/ctime复核，变化不发布或缓存；权限/预算失败不伪装完整。索引为提示，实际发送仍独立读取授权根、复核Thread关联；不是OMP工具沙箱。

Renderer 150ms合并连续输入，Query按Thread/关键词隔离；等待、关键词不一致和刷新失败均不能选旧结果。Enter只确认当前候选，等待/错误也消费Enter而不发送。业务导入/提交副作用保持现有协调器、收据和Main所有权。

## 候选与验证

| 项目 | 精确身份或结果 |
| --- | --- |
| 本段 base / merge-base | b290b36ea73f6586f6b9706e014f4c80a0720d33（04c规划提交） |
| 产品 source | 31cb91229852d8c6dfabb6e88fce06e78cbf6030 |
| clean 包内构建 | 0.1.0-m2.15 / 31cb9122-865978d1，dirty=false；读取实际包Main日志 |
| App | dist/reference-m2.15-clean/mac-arm64/d-pi.app |
| ZIP | dist/candidates/d-pi-0.1.0-m2.15-31cb912-mac-arm64.zip；哈希见下方机器证据 |
| 完整工程 | pnpm check：711行为/34架构/70tooling通过，native CLI与benchmark两项opt-in跳过；benchmark另行实际执行14/14。六类型、lint/设计/i18n/文档/结构/状态通过 |
| 构建 | 固定source隔离checkout frozen安装、pnpm build/electron-builder成功，沿用锁定Electron44.4.5、Bun1.3.14、OMP18.4.6 SDK资源；SDK相关集成实际通过 |
| 两轴独立评审 | [最终评审](project-references-review.md)固定31cb912，无未解决高价值问题，实际发现已根核实/修复/复核 |
| 实际包内 | 24项通过；[完整结果](evidence/references-package-result.json)、[包内输出](evidence/references-package.txt) |
| 性能 fixture | 20,001条目冷构建78.20ms；30次暖查询平均8.38ms、范围0.98–40.58ms、全部文件系统I/O为0；[机器测量](evidence/references-benchmark.json) |
| 包完整性 | ZIP CRC及app.asar同源核对见[候选机器摘要](evidence/references-candidate.json) |

旧搜索3次有6次readdir、1503次lstat，只返回首500后代中的100文件；新冷构建覆盖20,001条目包含目录，两者不是等覆盖冷延迟倍数比较。性能为本机fixture实测，不是所有项目延迟承诺；高负载调度/GC具体归因未证明。热查询零I/O与有限条目/内存/工作量由行为测试和计数共同验证。

实际Electron包通过 `@@virtualList` 首位目录、文件行区分、真实Enter插入目录token且provider请求仍为0；随后实际固定原生SDK向隔离localhost supplier发送直接目录清单并持久冻结typed source，没有文件正文marker。此前附件回收、子Agent、切换/重连、原生队列与冷旧只读22项也在此候选通过。主供应商2次、子执行4次、辅助标题2次，仅localhost，无个人凭据/费用。默认布局阅读区101.53125px，编辑器和发送仍在窗口内。

关键截图：[深色正常](evidence/references-m2-reference-search-dark-normal.png)、[浅色紧凑](evidence/references-m2-reference-search-light-compact.png)、[目录token与解释](evidence/references-m2-reference-directory-token.png)。浅色截图捕获颜色过渡帧，只证明类型/布局呈现，不作为静态对比度证明；本段两轮批量视觉检查后停止，不扩大样式任务。

首个包在最终身份断言前已通过功能路径，但其build带dirty（主checkout同时有另一工作流WIP），未交付；完整失败现场保留dist/validation/project-references/first-package与原临时根。改用固定checkout重建，未移动/提交其它任务WIP。隔离检查首次缺dist/validation导致原生suite写证据失败，创建证据目录后最终711通过；不归因产品行为。原始日志见dist/validation/project-references，交接选取完整check/build/pack、真实red/green与性能证据纳入evidence/references-*。

## 试用与数据

1. 解压上述ZIP启动，核对0.1.0-m2.15 / 31cb9122-865978d1。选择含@virtualList文件夹的项目，在草稿输入@@virtualList，首项应为目录、带文件夹图标与类型；后代文件显示文件图标/类型。
2. Enter确认应只插入目录引用；查看发送时冻结目录条目提示。快速改变关键词时旧行立即隐藏，等待与刷新失败时Enter不确认或发送。新增/删除文件后使用刷新搜索观察新结果；通常30秒后下次查询自动更新。
3. 用已有授权配置按需要发送，目录冻结直接条目，单独@文件才冻结正文。目录超500直接条目、读取变化/拒绝应明确失败保留草稿。冷旧Thread仍只读，新建独立Thread才能执行；不据此声明旧执行恢复。

schema10为新typed manifest/冻结来源JSON设置旧读者兼容围栏，无新表；before-v10在恢复后保留schema9库。无新字段旧manifest仍按file；草稿采用/释放事实从schema9及以后继续同事务更新，20项生命周期回归通过。候选首次打开会升级库；降级须关闭App后使用升级前数据库与配套私有内容副本，不能仅git revert。未签名/公证，本地交付。

接下来按原父票完成PDF视觉/OCR及余下M2组合验收；真实供应商试用、系统输入法与用户认可pending。此前m2.14交接保留历史快照。构建时并存的交互策略工作未纳入此候选，其进度由对应任务维护。
