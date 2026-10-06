# 多 Thread 提醒交接

2026-10-06，从干净 `7c9e1fe` 继续 M2，本地分支 `codex/m2-thread-attention`。Main提醒投影与偏好、正式GUI和独立审查问题修复已实现；最终替代候选生成中。01c保持claimed，原生通知/窗口验收待Mac解锁。M2工程in-progress、用户认可pending，不push、不扩M3。

## 已实现行为

后台Thread出现待回答或失败，显示可点击应用内提醒和侧栏状态，不自动导航或抢焦点。正常完成默认只更新完成/未读；系统通知与完成通知均需用户明确开启。点击待答定位当前真实交互；失败定位同trace收据并展开，只有实际匹配收据时进入既有专注阅读，可恢复设置/编辑控件，原编辑器与草稿保留。过期点击查看当前状态，不替用户作答或重发。

Main复用实际RuntimeView/SubmissionReceipt；ACK、busy=false不作为完成。当前连接新问题产生新提醒身份，迟到终态失败可纠正完成；reload、暂时无窗口不把观察生命周期交给React。最多512项，超出表达覆盖缺口。偏好独立存于App SQLite，通知内容仅通用自有文案和六位Thread ID；不读取业务全文、秘密或OMP原生日志。

系统通知失败保留应用内状态，复用现有诊断trace；精确自有码notification-unavailable可脱敏导出。系统available只表达能力，不能证明OS许可或实际送达。候选未签名/公证；实际通知显示/点击另行观察，未以模拟或脚本发通知替代。

## 验证与限制

双轴独立审查、TDD证据见[评审](attention-review.md)与[原始过程](evidence/attention-tdd.md)。布局修复后完整pnpm check通过：795行为/34架构/74工具，2既有opt-in跳过，[原始检查](evidence/attention-layout-engineering-check.txt)。早期794行为结果保留；实际672afdc干净包16项通过后，截图又暴露失败详情裁切，已先红后修复。该旧候选与检查在[修复前包内结果](evidence/attention-macos-pre-layout/m2-result.json)，不充当替代包通过证据。

实机检查到达后台checkpoint后，Computer Use明确报告Mac锁定；已请求手动解锁、未收到确认，没有写observed/resume或模拟Notification点击。checkpoint五分钟真实超时，原始日志/DOM/截图及[原生记录](evidence/attention-macos-inspection-blocked/native-actions.md)保留。原生通知显示/点击、实际关窗/同App重开未验收，01c不能关闭。

实际SDK与localhost供应商隔离HOME、配置、App数据和项目，不调用个人认证或付费供应商。Chromium组合事件不等同系统IME。冷旧Thread保持只读、unknown不自动重发。PDF视觉/OCR、完整V1-00/B6负载/故障组合、真实供应商试用和用户认可仍开放。
