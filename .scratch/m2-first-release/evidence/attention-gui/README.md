# 01b GUI worker evidence

固定 base 3cbff7e；cwd /Users/louistation/.codex/worktrees/m2-attention-gui/d-pi。入口 node scripts/testing/test.mjs vitest <targets>，终端原始输出保留（含既有固定 CLI opt-in skip）。

- 01-model-red / 02-model-green：初始镜像模块缺失→3行为通过。
- 04-gui-initial：正式GUI初始4行为为实施后补测，直接通过，不伪称初始红灯。
- 06-races-red / 07-races-green：退役Main实例倒退、导航中native点击丢失真实失败→修复；同版本显式刷新恢复亦通过。
- 10-entity-react：真实App/React镜像采样仅更新相关侧栏状态，不执行Composer及阅读业务子树，Controller/reading身份保持。
- 11-failure-location-red / 12-failure-location-green：failed误停conversation真实失败→submissions；实际Submissions展开匹配trace收据并聚焦，不派发。
- 18-stale-view-red / 19-stale-view-green：导航中failed→completed旧页签保留真实失败→抵达后按当前事件确定视图。
- 24-final-behavior：9文件64行为通过（含既有回归）；20-all-types全类型，21-design设计lint、22-i18n与23-architecture通过。
- 14-all-types及15-design是中间失败证据：strict optional测试fixture/未定义thread-notice类，已修复为窄guard与既有notice类，不能称这次通过。

仅展示镜像与导航意图，无执行事实衍生、轮询、Query重试或自动答复。available仅表述支持并提示权限，未声称授权/送达。真实macOS通知显示/点击、签名与系统权限、主题/密度/窄窗口布局由root候选验证，worker不冒称完成。
