# 01 工具入口与路由

Status: claimed
Blocked by: none

阶段：基建；依据：所属[规格](../spec.md)。主Agent负责。

交付：设置上方ToolsIcon及自有HoverMenu；悬停/点击/键盘可用菜单；类型安全/dev/components路由，返回会话入口，保留Thread身份/资源。新菜单封装加入看板。

写集：app图标、共享HoverMenu及样式、WorkbenchFrame/ApplicationLayout、routing/routes、导航回归测试；原业务所有权不变。

验收：TDD导航与菜单行为；真实渲染验证悬停转入菜单/选择、键盘Esc和返回、Thread资源连续。工程验收不包含用户认可。
