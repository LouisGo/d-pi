# 首个长会话阅读闭环独立复审

范围：原始真实基点 `6daf80ee25d8c45e03cb8ab1c8d7304f926ee187` 到本轮实现；独立只读 Spec 与 Standards reviewer，主 Agent 负责集成与验证。蓝图作为材料，授权以当前用户请求/所属 spec 为准。

## 已证实发现与关闭

Spec 在 `ce47707` 找到 P2：新来源 DOM 已提交但初次 restore 尚未执行，显式用户导航未取得当前来源归属，下一次几何恢复丢掉该位置。独立复现；`3974e71` 红绿最小修复，显式输入采用新来源，普通迟到 scroll 仍不采用；reviewer 在 `c04e245` 独立跑 HappyDOM 确认新源190px及旧源230px均保持，原 P2关闭。

主层真实 Electron 找到历史 Modal 返回隐藏 gap 按钮的键盘焦点问题；`fe170c0` 改为现有始终可见工具按钮。对应实际红灯及 synthetic/实际 Main历史返回绿灯保留。

## 独立结论

- `c04e245`：Spec / Standards 均0个高价值遗留；不把主层宣称代替独立复现。
- `7e16f9921de6732f8ab696a924e2c57bb3cc39ca`：Standards 再次固定干净HEAD复核全部本轮生产代码，以及最新main窗口/菜单组合，0个高价值发现；diff check通过。监听释放、导航键解除pointer模式、阅读投影预算/所有权保持。此 reviewer 未独立运行Electron/clipboard，试验由主层证据支撑。
- `d987f98a8cd7aafb432ab51f15244e8b04ccb618`：Spec 固定干净HEAD复核全部阅读行为及harness增量，0个高价值遗留。等待只观察控件/提示、不写滚动或来源，≤2px锚点、A→B→A、generation、用户接管和生命周期断言保留；复制依然验证native pointer命中、hash与ownership。此次未独立跑Chromium/clipboard，主层干净HEAD 24项实际复验通过。此前单次R2只观察到undefined且原result被覆盖，根因无法确认；3帧缺少两路React提交完成信号是合理推断，不能写成已证实产品竞态。

尚未实测的OS/物理输入/包/长稳边界见[交接](reading-loop.md#实质边界)。没有把范围外未知项写成已证实缺陷；没有用无问题评审代替用户认可。
