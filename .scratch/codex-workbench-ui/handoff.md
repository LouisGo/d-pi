# 本地工作台候选交接

2026-10-07。当前指针反馈修正版源 f9cc66e13fb638a95f9931fa6fe81241585c43c4，分支codex/workbench-pointer-focus，基点已合并的b952f07512af3508aff97f3bf409050fdaffedab。其后仅证据/交接文档，不冒称后续HEAD为包内源。

## 当前候选

- 应用：`/Users/louistation/.codex/worktrees/codex-workbench-ui/d-pi/dist/workbench-ui-focus/mac-arm64/d-pi.app`
- 版本/构建：0.1.0-workbench.3 / f9cc66e1-f83299df，dirty=false，macOS arm64本地未签名包。
- app.asar SHA-256：096644593d1a77b87f29ed4d84198e096dd34e56791568ad2c1ea6e4379c5e6a。
- 上一版workbench.2仍留在dist/workbench-ui；其完整证据见[验证记录](validation.md)。用户已授权同UI范围push/PR/合并；未公开发布，用户认可pending。

## 试用步骤

1. 正常退出旧d-pi，再在Finder打开当前候选，核对侧栏版本/构建号；单实例保护可能把第二次启动交给旧实例。
2. 在当前Thread行和左侧会话图标上用鼠标hover/点击：只用背景/文字表达状态，不出现额外蓝框。用Tab/Shift+Tab导航：焦点轮廓保留。选择状态与键盘焦点分别表达。
3. 新会话在第二列顶部，打开项目为分类标题右侧加号；设置是大Modal，语言单独一行，主题按light→dark→system→light循环，各有图标。Esc返回设置入口，背景保留唯一Tiptap/草稿/阅读位置。
4. 红黄绿右侧为后退、前进与侧栏开关，顶栏空白声明为drag区域；三边面板阈值收起/恢复与窄窗覆盖导航沿用。生产无真实内容的右/底宿主关闭。
5. 普通启动沿用原App数据与OMP配置，没有自动授权项目执行或发送；旧native session仍按原合同只读，使用新会话入口继续业务。旧density字段兼容读取但不影响默认紧凑尺寸。

## 已验证与未覆盖

本修正check:fast、lint:design、build/package通过；68条隔离Electron记录（67断言/矩阵+1输入到rAF采样），两主题交互/Portal/Monaco检查通过。[14条新版包记录](evidence/pointer-focus/packaged.json)为13检查+checkpoint，使用真实Main/preload/SessionHost/固定SDK18.4.6与localhost确定性supplier；[CUA原生状态切换](evidence/pointer-focus/native-cua.json)确认鼠标无蓝框、Tab有轮廓、实际坐标点击退出轮廓。新版未重跑可选Router/附件增量，上一版证据独立保留。[本地双轴复核](review.md)；远端CI与合并状态由补充PR核实。

A3物理拖窗仍未确认，原因unknown；系统IME候选窗、VoiceOver和长时流式大历史性能仍未覆盖。CUA共享标记影响交通灯像素观测。无真实账户/provider成功或计费证据，04继续claimed、工程partial、认可pending。

## 复现

```sh
pnpm check:fast
pnpm lint:design
node validation/m2/interaction-policy.mjs .scratch/codex-workbench-ui/evidence/pointer-focus/interaction.json
node validation/m2/workbench.mjs .scratch/codex-workbench-ui/evidence/pointer-focus/native.json
node validation/m2/package.mjs dist/workbench-ui-focus/mac-arm64/d-pi.app --workbench
```

构建从干净应用源执行pnpm build与electron-builder --mac --dir，验证包内commit/dirty与asar哈希；文档提交不改写固定包的来源。
