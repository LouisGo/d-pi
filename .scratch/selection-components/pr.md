## Summary

Select默认向下展开、空间不足翻转，避免覆盖触发器。ChoiceGroup限定二值胶囊，模型/子Agent模型选择整合弹层内搜索，左侧SearchIcon并默认聚焦。存量控件及全局交互规则默认禁止outline，只保留键盘/无障碍可见焦点。

范围见[规格](spec.md)。本地分支`codex/selection-components`，实现提交`cb08394`和`e90821f`；目标`main`，已按用户授权合入，merge commit `abaea1316d4f45daaf145c139a9e1cee59a934af`。未push或创建远端PR。

## Evidence

[验证记录](validation.md)区分实际已跑证据与最后代码补充：此前45项相关测试、类型/设计/架构检查、构建及两个隔离Electron场景通过。SearchIcon/显式自动聚焦与outline补充按用户要求只改代码，未重跑测试或GUI；本地合并也未追加验证。没有最终head独立review或CI，不声称最终head已验证、用户认可或发布。

## Merge Danger

可逆UI与文档变更，无数据迁移、认证、执行或权限变更。影响全局焦点提示与所有选择控件；指针/无障碍焦点来源处理尚未实测。main原有终端B文档提交保留。需要回滚时revert上述merge commit并指定main父提交（`git revert -m 1 abaea1316d4f45daaf145c139a9e1cee59a934af`）；试用与用户认可继续pending。
