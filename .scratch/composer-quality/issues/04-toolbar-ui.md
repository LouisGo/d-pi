# 04 Composer 底部操作组合

Status: resolved
Blocked by: none

所属[规格](../spec.md)，用户2026-10-08拒绝旧UI后的纠正范围。主Agent单写管理状态，独立worker工作树 /Users/lou/.codex/worktrees/composer-toolbar/d-pi，分支codex/composer-toolbar-ui，基点72863d9。只写纯展示ComposerToolbar/ActionMenu与就近测试/自有图标；root负责Composer绑定、附件/正文及集中CSS集成。不得修改M2、draft、Main、shared locale或管理状态。

验收：模型/项目权限slot在左、少量icon动作+send slot在右，移走输入选项Disclosure，真实菜单支持keyboard/焦点/选择状态；操作callbacks与disabled状态准确，长名称/窄窗不溢出，视觉引用共享token。

## Comments

- 2026-10-08：worker b8dbdf6以01ea0d6串行集成；3项有效红→7项绿。root绑定真实model/执行权限/发送状态，没有伪造Full access，随后f37b47f7修复展开后的有效Enter提示与编辑焦点。共享弹层fee53ddf；最新3918b64中底栏/More在浅深色宽窗与565px内容视口可见、无横向溢出。fresh finish reviewer实际验证菜单与鼠标展开焦点，工程验收完成。
