# 原生验证层级

最终候选source9a8c2ee、build9a8c2eea-7f1a67df，本轮运行--attention自动包内检查16项通过，没有--attention-inspect。native.displayClick和native.closedWindow均not-exercised，systemCapability=available仅为能力采样。

此前1a557225实际原生inspect受Computer Use Mac locked阻塞，五分钟checkpoint超时，详见../attention-macos-inspection-blocked/native-actions.md。未收到用户手动解锁确认，不模拟通知点击/原生window事件、不写observed/resume。最终系统显示/点击、实际关窗/同Main重开保持待验，01c claimed。
