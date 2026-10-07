## Summary

选中的一级导航、Thread行在hover/active时通过navigation variant新增蓝色border，产生不一致描边。移除这两条指针边框规则；普通按钮鼠标焦点不加outline，键盘focus-visible恢复统一主题轮廓。设置、表单、链接、summary、分隔条、文件结果与诊断字段沿用同一focus角色；select不再改变指针状态border-color。此前“移除所有outline”的误解已按用户澄清纠正。

所属[规格](.scratch/codex-workbench-ui/spec.md)、[设计合同](docs/architecture/design-system.md)。不改变业务准入、持久化、焦点交接或资源拥有者。

## Evidence

[真实边框红灯](.scratch/codex-workbench-ui/evidence/pointer-focus/red-navigation.txt)→修复通过。[68条Electron记录](.scratch/codex-workbench-ui/evidence/pointer-focus/native.json)覆盖两主题鼠标move/down/up/click与Tab/Shift+Tab：navigation/Thread/设置无新增指针描边，键盘轮廓可见；原几何/图标/资源连续性继续通过。[两主题交互记录](.scratch/codex-workbench-ui/evidence/pointer-focus/interaction.json)含主按钮、图标、选中/非选中导航、select、summary、link与Portal/Monaco/Diff。

check:fast、lint:design、机械设计扫描、build/package通过。[实际包14记录](.scratch/codex-workbench-ui/evidence/pointer-focus/packaged.json)为13检查+checkpoint，固定SDK18.4.6与localhost supplier；[原生CUA](.scratch/codex-workbench-ui/evidence/pointer-focus/native-cua.json)确认鼠标点击无蓝框、Tab有轮廓、实际指针点击退出轮廓。[小改动本地两轴复核](.scratch/codex-workbench-ui/review.md)，未冒称新的独立子Agent审查。

候选0.1.0-workbench.3 / f9cc66e1-f83299df，应用源f9cc66e13fb638a95f9931fa6fe81241585c43c4、dirty=false，[试用交接](.scratch/codex-workbench-ui/handoff.md)。新版未重跑可选Router/附件增量，旧证据不冒称此次覆盖。远端CI按实际head核实后转ready。

## Merge Danger

Two-way：影响共享CSS及控件状态，回滚CSS即可恢复原视觉；无schema、权限、发送副作用或草稿/附件/OMP资源迁移。键盘轮廓可能在原来仅用背景反馈的地方出现，这是本次明确要求；编辑器caret、浮层焦点协议保留。物理拖窗、系统IME候选窗/VoiceOver与长时性能仍开放，合并不提升用户认可，不公开发布。
