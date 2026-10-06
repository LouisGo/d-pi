# 原生检查受阻

2026-10-06，候选build 1a557225-344c54b0。实际固定SDK/localhost/正式GUI自动路径到达background原生检查点。Computer Use getApp(local.d-pi.m2-validation)返回：The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.

已请求用户手动解锁，未收到解锁确认；没有写observed或resume文件、没有模拟Notification click/原生窗口事件。5分钟checkpoint真实超时，原始stdout、DOM与截图保留；因环境受阻而非产品断言失败。actual system notification display/click、原生关闭/同App重开未验证，不能据此关闭01c。
