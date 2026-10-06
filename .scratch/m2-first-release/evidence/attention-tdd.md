# 多 Thread 提醒 TDD 与证据归属

固定共同起点3cbff7e；Main/GUI/验证独立checkout，主Agent只管理规格/票/看板与集成。候选、App内行为、原生系统送达及用户认可分别记录。

## 主Agent边界

- preload先写外来trace/错误偏好ACK拒绝测试，缺少bridge模块实际红灯，再最小实现通过。[红](attention-preload-red.txt)/[绿](attention-preload-green.txt)。有效/无效订阅、取消精确listener、非法输入不invoke与transport trace为已有边界补测，不伪造新增红灯。
- desktop-services先写窗口不存在仍观察真实Runtime/receipt和observer异常不阻断Renderer发布；实际失败为onRuntimeView调用0次。随后装配Main callbacks通过。[红](attention-services-red.txt)/[绿](attention-services-green.txt)。mock只验证callback装配边界，完整SDK/OS由实际包另验证。
- SDK与Node/Electron/Bun环境遵守固定README；[环境](attention-environment.txt)、[frozen安装](attention-install.txt)、[资源](attention-sdk.txt)。

## Worker日志

Main与GUI保留原始红绿及补测日志，在集成后归档；单测证明受控适配边界，不代表系统通知实际上屏。GUI初始React场景为实现后补测直接绿，竞态与失败定位才有实际红绿，不能把所有GUI测试称作先失败。

系统通知的macOS签名条件来自[Electron官方](https://www.electronjs.org/docs/latest/tutorial/notifications#macos)与固定v44.4.5类型/API。未签名候选的失败/未知如实记录，不通过mock、isSupported或show()调用伪证送达。

## 独立评审修复

- Spec两项P2：路由未对齐前的visible、同trace并发新pending问题不更新event。已分别实际失败→通过。visibility初版fixture误以为routing.connect不跟随model，错误断言日志保留；修正为每次真实visible命令的路由采样后，旧实现确实false，新实现true。
- Standards终态P2：同submission completed→failed被去重丢弃。固定Runtime既有completed→error回归与实际类证明，root先红后修正，失败保持且重复success不擦除。
- Standards harness P2：切回A后seen B应拒绝invalid-request，改正确期望并独立snapshot证明无open/无重发，没有放松IPC。
- root38项受影响行为通过，全工程最终793行为/34架构/74工具通过。首次结构报告陈旧失败保留，生成后复跑通过。
- 磁盘ENOSPC保留观测；仅移除本轮已提交且raw证据已跟踪的worker CLI worktrees，以及本会话m2.17已受测临时App重复件（确认与原候选/跟踪证据的app.asar同源）。原候选和原生/数据库/截图证据保留。新验证copy使用COPYFILE_FICLONE尽量减少APFS占盘，仍复核产品身份。
