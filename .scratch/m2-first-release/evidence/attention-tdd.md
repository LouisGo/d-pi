# 多 Thread 提醒 TDD 与证据归属

固定共同起点3cbff7e；Main/GUI/验证独立checkout，主Agent只管理规格/票/看板与集成。候选、App内行为、原生系统送达及用户认可分别记录。

## 主Agent边界

- preload先写外来trace/错误偏好ACK拒绝测试，缺少bridge模块实际红灯，再最小实现通过。[红](attention-preload-red.txt)/[绿](attention-preload-green.txt)。有效/无效订阅、取消精确listener、非法输入不invoke与transport trace为已有边界补测，不伪造新增红灯。
- desktop-services先写窗口不存在仍观察真实Runtime/receipt和observer异常不阻断Renderer发布；实际失败为onRuntimeView调用0次。随后装配Main callbacks通过。[红](attention-services-red.txt)/[绿](attention-services-green.txt)。mock只验证callback装配边界，完整SDK/OS由实际包另验证。
- SDK与Node/Electron/Bun环境遵守固定README；[环境](attention-environment.txt)、[frozen安装](attention-install.txt)、[资源](attention-sdk.txt)。

## Worker日志

Main与GUI保留原始红绿及补测日志，在集成后归档；单测证明受控适配边界，不代表系统通知实际上屏。GUI初始React场景为实现后补测直接绿，竞态与失败定位才有实际红绿，不能把所有GUI测试称作先失败。

系统通知的macOS签名条件来自[Electron官方](https://www.electronjs.org/docs/latest/tutorial/notifications#macos)与固定v44.4.5类型/API。未签名候选的失败/未知如实记录，不通过mock、isSupported或show()调用伪证送达。
