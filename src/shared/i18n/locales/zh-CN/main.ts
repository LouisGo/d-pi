export const main = {
  "main.chooseProject.title": "选择项目并创建草稿",
  "main.loggingFailure.message": "诊断日志暂时无法写入",
  "main.loggingFailure.detail":
    "排查记录可能不完整。草稿是否保存仍以编辑区的保存状态为准。请检查应用数据目录的可写性。",
  "main.loggingFailure.acknowledge": "知道了",
  "main.closeUnconfirmed.message": "未能确认草稿已保存",
  "main.closeUnconfirmed.detail":
    "窗口保持打开。请检查当前输入与保存状态，再尝试关闭。",
  "main.closeUnconfirmed.keepWindow": "保留窗口",
  "main.rendererGone.message": "输入窗口已中断",
  "main.rendererGone.detail":
    "重新打开会恢复最后已确认保存的草稿；未保存的输入可能丢失。",
  "main.rendererGone.reopen": "重新打开",
  "main.closeUnsaved.message": "草稿尚未保存，窗口已保留",
  "main.closeUnsaved.detail":
    "请先确认输入法候选，或处理界面中的保存失败后再关闭。",
  "main.closeUnsaved.continueEditing": "继续编辑",
  "main.menu.about": "关于 d-pi",
  "main.menu.quit": "退出 d-pi",
  "main.menu.edit": "编辑",
  "main.menu.undo": "撤销",
  "main.menu.redo": "重做",
  "main.menu.cut": "剪切",
  "main.menu.copy": "复制",
  "main.menu.paste": "粘贴",
  "main.menu.selectAll": "全选",
  "main.menu.window": "窗口",
  "main.menu.minimize": "最小化",
  "main.menu.zoom": "缩放",
  "main.menu.close": "关闭窗口",
  "main.quitActive.message": "仍有原生工作或状态尚未确认",
  "main.quitActive.detail":
    "等待会在工作结束且草稿保存后退出。停止会中断当前执行并暂缓队列；如仍有队列、交互或后台活动，应用会继续保留，请处理后退出。未知状态不会被强行终止。",
  "main.quitActive.wait": "等待结束后退出",
  "main.quitActive.stop": "请求停止后退出",
  "main.quitActive.cancel": "取消退出",
} as const;
