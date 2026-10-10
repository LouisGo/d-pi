export const domain = {
  "subagents.observationLimit": "仅显示前 128 个任务，列表不完整。",
  "subagents.unhandledEvent": "暂不支持显示 {eventType}，过程可能不完整。",

  "subagents.reconnect": "重新连接",
  "subagents.heading": "子 Agent",
  "subagents.pending": "待开始",
  "subagents.running": "进行中",
  "subagents.completed": "已完成",
  "subagents.failed": "失败",
  "subagents.aborted": "已停止",
  "subagents.unknown": "状态未知",
  "subagents.copy": "复制结果",
  "subagents.task": "查看任务",
  "subagents.model": "模型",
  "subagents.currentTool": "当前工具",
  "subagents.progress": "进展片段",
  "subagents.result": "查看结果",
  "subagents.noResult": "暂无可读结果。",
  "subagents.coverage":
    "仅显示当前连接中收到的任务。重连前已结束的任务可能不在列表中；状态与主任务分别显示。",
  "subagents.transcriptUnavailable": "无法读取完整结果，仍显示已收到的内容。",
  "subagents.transcriptTooLarge": "结果过大，未完整读取，仍显示已收到的内容。",
  "subagents.transcriptEmpty": "暂无完整结果，已显示内容可能不完整。",
  "subagents.transcriptReset": "结果记录已重置，内容可能不完整。",
  "subagents.truncated": "仅显示部分结果，原文仍完整保留。",
  "subagents.identityAmbiguous": "无法确认部分事件属于哪个任务，暂未合并。",
  "subagents.missingLifecycle": "缺少任务开始记录，过程可能不完整。",
  "subagents.observationUnavailable":
    "暂不能更新子 Agent 状态。已显示内容可读，状态可能过期。",

  "submission.contentNotReady": "附件尚未准备好，请处理后再发送。原文仍保留。",
  "submission.imageUnsupported":
    "当前模型或连接不支持此图片输入，请换用兼容模型。原文仍保留。",

  "runtime.evidenceGap": "部分记录未能保存或关联，结果仍未知，不会自动重发。",
  "runtime.processingInput": "处理消息中…",
  "runtime.resourceUnknown": "无法确认运行资源。",
  "runtime.readyToSend": "可以发送。",
  "runtime.noModel": "没有可用模型，请在设置中连接模型服务。",
  "runtime.disconnected": "连接已中断，草稿已保留。",
  "runtime.controlFailed": "操作未完成，请检查任务状态。不会自动重试。",
  "runtime.queuePaused":
    "已暂停后续消息，点击“继续发送”恢复。后台任务可能仍在进行。",
  "runtime.controlUpdated": "状态已更新。",
  "runtime.pendingInteraction": "等待你回答。",
  "runtime.processing": "生成中…",
  "runtime.idle": "可以继续发送。",
  "runtime.statusUnknown": "会话状态未知，请查看详情。不会自动重发或强制停止。",
  "runtime.configDefault": "沿用 OMP 默认设置和启动环境。",
  "runtime.previousSessionReadOnly":
    "无法确认此会话可独占执行，目前只读。关闭其他终端后仍需重新检查。",
  "runtime.preStartTrust":
    "启动前会重查目录。执行时使用当前系统账户权限，访问不限于此项目。",
  "runtime.controlDispatched": "请求已发出，等待状态更新。不会自动重试。",
  "runtime.directoryChanged":
    "项目目录已变化，已阻止新消息。当前任务不会因此停止。",
  "runtime.grantSaveFailed": "执行权限保存失败，请检查目录和本地存储。",
  "runtime.revokedStopRequested": "已阻止新操作并请求停止，是否停止仍待确认。",
  "runtime.browseOnly": "当前项目仅浏览。",
  "runtime.starting": "准备并连接会话中…",
  "runtime.recoveryBindingChanged":
    "原会话记录、项目或设置已变化。请检查后重试，草稿仍保留。",
  "runtime.recoveryOccupied":
    "会话或项目正被其他窗口或终端使用。请结束那里的任务后重试，草稿仍保留。",
  "runtime.recoveryOwnerUnknown": "无法确认上次连接，请重新检查。",
  "runtime.recoveryShutdownUnconfirmed":
    "尚未确认上次任务进程已停止，请重新检查。",
  "runtime.recoveryLeaseUnavailable":
    "无法取得会话执行权限，请重新检查；仍失败时查看诊断。",
  "runtime.notReady": "会话未就绪，请检查项目权限和模型设置。",
  "runtime.grantInvalid": "项目目录或执行权限未确认，暂不能发送。",
  "runtime.connectionUnknown":
    "连接状态未知，请重新检查。草稿仍保留，不会自动发送。",
  "runtime.configUnknown": "设置来源未知",
  "runtime.controlUnknown": "操作结果未知，请检查状态。不会自动重试。",
  "runtime.answerUnknown": "回答结果未知，请检查回答记录。不会自动重发。",
  "runtime.dismissUnknown": "提示关闭失败，请检查问题状态后重试。",
  "runtime.resourceMissing":
    "运行资源缺失。开发版运行 pnpm runtime:fetch；安装版请重新获取完整应用。",
  "runtime.resourceUnreadable": "无法启动运行引擎，请检查应用资源权限。",
  "runtime.resourceIncompatible":
    "运行资源未通过检查。开发版请检查受管理资源；安装版请重新获取完整应用。",
  "runtime.sdkResourcesUnavailable":
    "运行资源缺失或损坏。开发版运行 pnpm runtime:sdk；安装版请重新获取完整应用。",
  "runtime.configProfile": "OMP 配置方案：{profile}",
  "runtime.configDirectory": "OMP 设置目录：{directory}",
  "submission.storageUnavailable":
    "发送记录无法保存。请备份原文并检查状态，先别重复发送。",
  "submission.notReady": "会话尚未就绪，原文仍保留。",
  "submission.unsupportedNativeCommand":
    "未发送：此命令不能迁移或删除应用管理的会话。原文仍保留。",
  "submission.contentTooLarge": "消息超过发送上限，原文仍完整保留。",
  "submission.unknownSubmission": "找不到此发送记录。",
  "submission.staleEvent": "已忽略旧连接的确认信息。",
  "submission.revisionConflict": "消息或草稿版本已变化，请检查当前内容。",
  "submission.queueFull":
    "待发送消息已满（20 条），请稍后再发。原文仍保留，不会自动重发。",
  "submission.stateUnverified": "发送状态未确认，请保留原文，先别重发。",
  "submission.unsentDraft": "未发送，请检查内容和保存状态。",
  "submission.sendUnknown": "发送结果未知，原文和记录仍保留，不会自动重发。",
  "submission.followUpPending": "补充消息发送中…",
  "submission.followUpUnknown":
    "补充消息结果未知，原文和记录仍保留，不会自动重发。",
  "submission.resendUnknown": "重发结果未知，原文仍保留，不会自动重发。",
  "submission.continueUnknown": "发送结果未知，请检查发送记录。不会自动重发。",
  "draft.alreadyActive": "已有草稿，请继续当前项目。",
  "draft.directoryUnavailable": "目录不存在或无法读取，请重新选择。",
  "draft.identityMismatch": "草稿不匹配，未保存。请检查当前会话。",
  "draft.revisionConflict":
    "草稿版本不同，当前输入仍保留。请检查后选择要保留的版本。",
  "draft.storageUnavailable": "本地数据读写失败。请先复制当前输入，再重试。",
  "draft.contentTooLarge":
    "正文超过 4 MiB，尚未保存。请先复制备份，再缩短内容。",
  "draft.invalidSource": "无法接受此请求。",
  "draft.invalidRequest": "请求格式不支持，输入仍完整保留。",
  "draft.storageOpenFailed": "无法打开本地数据，未重置内容。请检查日志和备份。",
  "draft.transportUnknown":
    "连接中断，保存结果未知。请检查保存状态，当前输入仍保留。",
  "conversation.toolResult": "工具结果",
  "conversation.nativeInput": "你",
  "conversation.nativeEvent": "会话事件",
  "conversation.truncated": "仅显示部分内容，可在会话工具中查看原生历史。",
  "conversation.unsupportedNativeEvent": "暂不支持完整显示 {eventType}。",
  "conversation.retrying": "连接中断，正在重试…",
  "conversation.retryCompleted": "已重新连接，可继续阅读。",
  "conversation.retryFailed": "重新连接失败。",
} as const;
