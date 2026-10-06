# m2.19 最终 macOS 原生操作证据

2026-10-06，受测根 tk77Eu，产品48cd01cc-42704447，外部 harness adcd4d3。精确 bundle/root/build 在 m2-result.json 与各 checkpoint/observation 中保存。

CUA 首先核实精确 local.d-pi.m2-validation 窗口/asar URL与草稿。用户已改变旧 Finder 窗口为 Downloads，读取新状态后保留其选择；通过 Cmd+N 新建本轮专用 Finder 窗口，使测试 App 真正进入后台，再写 background observed/resume，供应商仅此后释放。

真实 SDK completion 后 Main system=failed。CUA 确认3ca00f已完成/未读和应用内提醒，实际点击提醒设置确认两项偏好开启及系统未能显示反馈，草稿保留。display-click 写 unavailable；没有实际 OS 显示/点击，没有完整 Notification Center 观察，没有制造 callback。未签名候选，具体系统失败根因 unknown。

实际 CUA Cmd+W 关闭精确测试窗口；新 AX 无窗口，独立 App inventory 显示测试 bundle 仍运行。写 close-window observed/resume 后才释放 closed 请求。Main 保存4be5a4 completed/unread。

在专用 Finder Cmd+Shift+G 前往 tk77Eu/Package With Spaces，AX 精确 file URL；实际双击 d-pi.app。新 CUA 窗口精确 tk77Eu asar/build，4be5a4 completed/unread，A_UNSENT_DRAFT 保留。重开路线是 Finder，不宣称 Dock。写 reopen observed/resume 后 harness 独立核对同一 Main instance、closed 请求恰好一次，无重发；5th预算与冷启动也通过，最终18项。

主 Agent 实看正常、紧凑、560px窄窗口、原生重开和失败收据截图，与五组预算指标一致。检查足以支持本轮有限布局与窗口路径，不外推真实账户或用户认可。结束后读取专用 Finder 当前 Package With Spaces 状态并 Cmd+W 关闭仅该窗口；未改个人 Finder 内容。自动 harness 负责测试 App 冷启动与收尾。
