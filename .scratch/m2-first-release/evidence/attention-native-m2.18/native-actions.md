# m2.18 实际 macOS 原生记录

Product source9a8c2eea41196b5584a46fcc575ed589a7cfe392，build9a8c2eea-7f1a67df，dirty=false；17项实际检查通过，完整原始结果/四个checkpoint/observations/resume与日志均在本目录。固定SDK与隔离localhost，无个人凭据。

- CUA准确绑定local.d-pi.m2-validation；临时Finder窗口前台，真实供应商结果在观察后才释放，App未退出。
- Main对实际通知报告system=failed，App保留完成/未读及A_UNSENT_DRAFT。没有观察到系统显示/点击，没有模拟回调，openRequests为空。ControlCenter/SystemUIServer绑定超时，NotificationCenter绑定选择widget、未读取完整通知面板；CUA不支持Fn组合。失败根因unknown，候选未签名，不使用密钥/修改系统权限。
- 实际Cmd+W关闭唯一d-pi窗口，AX返回noWindowsAvailable；独立运行App库存仍报告测试bundle运行，个人d-pi未运行。结果仍由held真实供应商在确认关窗后释放。
- Dock绑定超时，改用正常macOS替代入口：临时Finder窗口进入精确lHHVEy/Package With Spaces目录，实际双击该d-pi.app。重新绑定后真实窗口为相同asar URL/build；此项是Finder重开，非Dock点击。Harness随后独立证实Main instanceId不变、关闭期间实际完成/未读、closed供应商请求仅一次。

原生多提醒截图暴露阅读区挤压；不能将本候选17项检查当作布局无缺陷。另见../attention-budget-red真实旧包几何失败、独立预算评审及后续替代候选。
