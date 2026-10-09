export const domain = {
  "subagents.observationLimit":
    "活动任务超过快照观察预算，仅显示前 128 项。观察覆盖不完整。",
  "subagents.unhandledEvent":
    "子 Agent 事件 {eventType} 尚无专用视图，过程覆盖不完整。",

  "subagents.reconnect": "重新连接阅读",
  "subagents.heading": "子 Agent",
  "subagents.pending": "等待开始",
  "subagents.running": "执行中",
  "subagents.completed": "已完成",
  "subagents.failed": "失败",
  "subagents.aborted": "已中止",
  "subagents.unknown": "状态无法确认",
  "subagents.copy": "复制结果",
  "subagents.task": "查看任务",
  "subagents.model": "原生模型",
  "subagents.currentTool": "当前工具",
  "subagents.progress": "进度片段",
  "subagents.result": "查看可得结果",
  "subagents.noResult": "尚未取得可读结果。",
  "subagents.coverage":
    "仅显示当前原生实例中已观察的任务。重新启动 Host 后，之前结束的子任务不在活动快照中；执行状态与主提交分别判断。",
  "subagents.transcriptUnavailable":
    "原生结果记录不可读。保留已观察的片段，完整结果未知。",
  "subagents.transcriptTooLarge":
    "原生记录超过读取预算。保留已观察的片段，完整结果未读取。",
  "subagents.transcriptEmpty":
    "原生记录尚无可读正文。已观察片段不代表完整结果。",
  "subagents.transcriptReset": "原生记录已重置，结果覆盖可能不完整。",
  "subagents.truncated": "显示结果已截断；原生内容未改动。",
  "subagents.identityAmbiguous":
    "此原生身份关联到多个任务，无法归属的事件未合并。",
  "subagents.missingLifecycle": "未观察到此任务的开始，过程覆盖不完整。",
  "subagents.observationUnavailable":
    "子 Agent 观察不可用。先前的执行状态可能已过期，结果保持只读。",

  "submission.contentNotReady":
    "附件尚未准备完成。完整原始输入已保留，请处理失败项后再发送。",
  "submission.imageUnsupported":
    "当前模型或传输不能完整保留图像输入。请选择兼容模型；完整原始输入已保留。",

  "runtime.evidenceGap":
    "部分原生证据未能保存或关联。缺少的结果保持未知，不会自动重发输入。",
  "runtime.processingInput": "正在处理输入…",
  "runtime.resourceUnknown": "Runtime 资源无法确认。",
  "runtime.readyToSend": "OMP 已就绪，可发送文字。",
  "runtime.noModel": "没有可用模型，请先补齐原生 OMP 配置。",
  "runtime.disconnected": "连接已中断，草稿已保留。",
  "runtime.controlFailed": "控制请求未完成，请核对当前原生状态；不会自动重试。",
  "runtime.queuePaused":
    "已暂缓队列；明确继续后恢复消费。后台活动仍按实际状态显示。",
  "runtime.controlUpdated": "原生队列与控制状态已更新。",
  "runtime.pendingInteraction": "OMP 正在等待交互，请查看原生交互面板。",
  "runtime.processing": "OMP 正在处理…",
  "runtime.idle": "OMP 已空闲，可继续发送。",
  "runtime.statusUnknown":
    "OMP 状态无法确认。请检查原生配置，应用不会自动重发或强行结束任务。",
  "runtime.configDefault": "沿用 OMP 默认配置发现规则与应用启动环境",
  "runtime.previousSessionReadOnly":
    "此会话已有关联的原生会话。无法确认原生会话的执行全周期独占，当前只读历史；不会强占或新建会话替代。关闭外部 CLI 也不等于已经获得独占证明。",
  "runtime.preStartTrust":
    "启动前会再次核对目录。项目执行不等于文件沙箱，OMP 可使用当前系统用户的权限。",
  "runtime.controlDispatched": "控制请求已派发，等待原生状态；不会自动重试。",
  "runtime.directoryChanged":
    "目录身份已变化，当前原生实例不能复用。已阻止新提交，现有工作不会因此停止。",
  "runtime.grantSaveFailed": "未能保存执行授权，请检查目录和本地存储。",
  "runtime.revokedStopRequested":
    "已阻止新操作并请求停止。现有实例仍保留，待原生状态确认；不能据此视为已停止。",
  "runtime.browseOnly": "当前项目仅浏览。",
  "runtime.starting": "正在校验官方 Runtime 并启动原生会话…",
  "runtime.recoveryBindingChanged":
    "原会话文件、身份、项目或原生配置已变化。检查原会话后在这里重试，输入内容会保留。",
  "runtime.recoveryOccupied":
    "原会话有活跃写入者，或此项目仍开着 OMP CLI。结束该执行后在这里重试，输入内容会保留。",
  "runtime.recoveryOwnerUnknown": "暂时无法确认原执行实例身份。请重新检查。",
  "runtime.recoveryShutdownUnconfirmed":
    "尚未确认原执行进程已停止。请重新检查。",
  "runtime.recoveryLeaseUnavailable":
    "无法取得原会话执行权限。请重新检查；仍失败时查看诊断。",
  "runtime.notReady":
    "OMP 未能就绪。请检查目录授权与原生配置；当前证据无法确定配置缺失、不可读或格式不兼容。",
  "runtime.grantInvalid": "目录身份或执行授权无法确认，已阻止发送。",
  "runtime.connectionUnknown":
    "连接状态无法确认。草稿仍保留，请重新检查状态；不会自动发送。",
  "runtime.configUnknown": "配置来源尚未确认",
  "runtime.controlUnknown": "控制结果未知。请检查状态，不会自动重试。",
  "runtime.answerUnknown": "回答结果未知，请核对原生交互；不会自动重答。",
  "runtime.dismissUnknown": "关闭未知交互失败，请核对原生交互后重试。",
  "runtime.resourceMissing":
    "缺少官方 Runtime 资源。开发环境请运行 pnpm runtime:fetch；随包版本请重新获取完整应用。",
  "runtime.resourceUnreadable":
    "无法读取或执行官方 Runtime，请检查应用资源的文件权限。",
  "runtime.resourceIncompatible":
    "官方 Runtime 或 SDK 资源无法通过当前环境的兼容性或完整性校验。开发环境请核对受管理资源；随包版本请重新获取完整应用。",
  "runtime.sdkResourcesUnavailable":
    "官方 SDK 运行资源缺失或校验失败。开发环境请运行 pnpm runtime:sdk；随包版本请重新获取完整应用。",
  "runtime.configProfile": "OMP profile：{profile}（沿用原生发现规则）",
  "runtime.configDirectory": "原生配置目录：{directory}",
  "submission.storageUnavailable":
    "提交记录暂时无法保存。请保留原文并核对状态，不要重复发送。",
  "submission.notReady": "当前执行环境尚未就绪，原文已保留。",
  "submission.unsupportedNativeCommand":
    "未发送：当前不支持通过原生命令迁移或删除 App 管理的会话，原文已保留。",
  "submission.contentTooLarge": "正文编码后超过发送上限，原文未截断。",
  "submission.unknownSubmission": "找不到该次提交记录。",
  "submission.staleEvent": "已忽略不属于当前实例的回执。",
  "submission.revisionConflict": "提交身份或草稿版本已变化，请核对当前内容。",
  "submission.queueFull":
    "排队已满（20 条），请等待消费后再发送；原文已保留，不会自动重发。",
  "submission.stateUnverified": "提交状态尚未核对。请保留原文，不要重复发送。",
  "submission.unsentDraft": "未发送：请检查正文与草稿保存状态。",
  "submission.sendUnknown":
    "发送结果无法确认。原文与提交记录保留，不会自动重发。",
  "submission.followUpPending": "正在追发，请稍后。",
  "submission.followUpUnknown":
    "追发结果无法确认。原文与提交记录保留，不会自动重发。",
  "submission.resendUnknown": "再次发送的结果未知，原文保留，不自动重发。",
  "submission.continueUnknown":
    "继续发送的结果无法确认，请核对提交状态；不会自动重发。",
  "draft.alreadyActive": "当前已有草稿，请继续当前项目。",
  "draft.directoryUnavailable": "目录不存在或无法读取，请重新选择。",
  "draft.identityMismatch": "草稿身份不匹配，已阻止写入。",
  "draft.revisionConflict":
    "草稿版本冲突。当前输入已保留，请核对保存状态后选择要保留的内容。",
  "draft.storageUnavailable":
    "无法读取或保存本地数据；未删除数据库，请保留当前输入后重试。",
  "draft.contentTooLarge":
    "正文超过 UTF-8 4 MiB，尚未保存。输入未被截断；请复制备份或缩减后继续保存。",
  "draft.invalidSource": "请求来源无效。",
  "draft.invalidRequest": "请求格式不受支持，输入未被截断。",
  "draft.storageOpenFailed":
    "本地数据库无法打开。未重置数据，请检查日志与数据库备份。",
  "draft.transportUnknown":
    "连接中断，保存结果未确认。当前输入已保留，请核对保存状态后继续。",
  "conversation.toolResult": "工具结果",
  "conversation.nativeInput": "原生输入",
  "conversation.nativeEvent": "原生事件",
  "conversation.truncated": "显示已截断；可读取原生记录核对",
  "conversation.unsupportedNativeEvent":
    "收到 {eventType}。此类事件的完整交互尚未接入。",
  "conversation.retrying": "连接中断，OMP 正在自动重试。",
  "conversation.retryCompleted": "OMP 自动重试已结束，继续查看回复。",
  "conversation.retryFailed": "OMP 自动重试未成功。",
} as const;
