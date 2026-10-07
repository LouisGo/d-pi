# 三层布局独立审查

2026-10-07。固定总范围 `d4f380c→bded41f`；初轮head `5b60446`，修正head `bded41f`。两名独立只读review Agent分别覆盖Spec与Standards；本文汇总其实际结论，未把作者GUI结果冒称独立执行。

## Spec

review_spec核对用户三层布局、设置宽区/工具窄区、无Home icon、28px状态栏、真实列宽对齐、状态数据范围、现行文档取代关系、窄窗与资源合同，无高价值发现。追加复核尺寸/覆盖层/focus修正与原需求组合，无新增发现。源码审查通过不代替用户认可；尚未独立运行native。

## Standards

review_standards在初轮发现两个P2：嵌套split受控像素与旧axis缓存竞态，及窄窗overlay进入developer后仍开放。独立native探针复现初始120px状态对应90.68/60px真实尺寸（先前窗口时序不同），正文focus暂藏成功，后者不列缺陷。

修正head复核两条均关闭：实际轴变化后rAF重施controlled pixels；developer立即关闭overlay并清理状态，finalFocus指向可见返回会话按钮。正文与标题所属识别覆盖所有host。未发现新增实质问题。

追加复核已读取三层native的27条通过记录，组件120→150→120三条通过；其读取组件文件早于作者最终复跑完成，没有独立声称完整组件场景通过。作者随后完整27条通过记录见交接。独立探针只读取固定源码，不改仓库或账户。

## 证据层级

[交接](sandwich-validation.md)提供作者完整工程/隔离GUI结果与未覆盖项。此review不声称真实供应商、用户试用、系统IME/VoiceOver、物理拖窗或最终发行完成。

收尾复核核对三份JSON为27/27/68通过，工程日志为830行为通过/2skip、35架构与96tooling通过，构建成功。指出navigation合同残留“一级会话入口”文案，已在ed21297改为顶栏“返回会话”，文档检查通过。最终作者快速门禁日志见[check:fast](evidence/sandwich/fast.log)；不声称review Agent独立重跑门禁。
