# 本地工作台候选交接

2026-10-07。分支codex/workbench-ui，基点37e1a62b889fdfaa1db274b60bac69b98d54d23c；最终应用源提交91499e7f73e15cf0c27906728c3cf361b8988cff。后续仅证据/交接/聚合文档提交，包不冒称后续HEAD。

## 候选身份

- 应用：`/Users/louistation/.codex/worktrees/codex-workbench-ui/d-pi/dist/workbench-ui/mac-arm64/d-pi.app`
- 版本/构建：0.1.0-workbench.1 / 91499e7f-7bca4f14，dirty=false。
- app.asar SHA-256：`c2c8d7e1534b49d5b34ab7cf9c046c38fe3ca310bf567304fda4fbff8c9d0aab`。
- macOS arm64本地未签名包，未push、merge或公开发布。原checkout仍37e1a62且干净，设计文档保留。

## 操作步骤

1. 正常退出旧d-pi，再在Finder打开上述候选；单实例保护可能把第二个包的启动交给已运行的旧实例，先核对侧栏版本/构建号。
2. 普通打开沿用原App数据和已有OMP配置；没有自动授权项目执行或发起发送。旧native session仍按原合同只读，使用原新会话入口继续业务。
3. 红黄绿右侧为后退、前进、侧栏开关；顶部留白声明为窗口拖动区。侧栏与右/底宿主的分隔条可拖到阈值收起，原尺寸显式恢复；窗宽不足时侧栏切为显式覆盖层，Esc回焦。右/底无真实内容默认关闭，生产不展示样本。
4. 左侧设置入口包含原配置、提醒与诊断；切回会话保持Tiptap/草稿与阅读坐标。主题按钮切light/dark；无密度切换，旧normal字段继续读取但界面固定默认紧凑。
5. 核对Chat图标、导航/主题/页签关闭按钮居中；未读变化不会挤动图标，数字/读屏状态也通过同一独立indicator插槽。

## 已验证与边界

完整工程检查806行为/35架构/89tooling通过；2项既有可选native smoke跳过。56条Electron隔离记录（包含1条输入到下一rAF的采样，不能当长时FPS）；18项实际包检查使用固定官方SDK18.4.6与localhost确定性supplier，覆盖Main/preload/OMP、Router准入、草稿/附件/撤销/合成IME/阅读/重载/冷恢复。[原始验证](validation.md)、[双轴审查](review.md)、[包内截图](evidence/packaged-workbench.png)。

A3物理拖窗尚未确认：CUA原生zoom成功，多次drag未见窗口坐标变化，系统日志Window move completed without beginning，原因unknown；CSS drag/no-drag不替代该证据。CUA共享标记遮住交通灯像素。系统IME候选窗、VoiceOver实际播报、连续流式大历史长时拖拽性能未覆盖。无真实账户/provider成功或计费证据，用户认可pending。04继续claimed，工程状态partial，候选已可本地试用。

## 目录职责

布局意图/几何/顶层可见性放shell/layout；公开控件与外部面板/浮层封装放components/ui。Main仅配置macOS hiddenInset，关闭/保存协议仍原拥有者。Thread/Tiptap/阅读/配置/文件/attention业务仍在原模块与workbench/reading，未创建第二份业务事实或完整组件库，未启动M3。

## 复现

```sh
pnpm check
pnpm lint:interaction
node validation/m2/workbench.mjs .scratch/codex-workbench-ui/evidence/native.json
node validation/m2/interaction-policy.mjs .scratch/codex-workbench-ui/evidence/interaction.json
node validation/m2/package.mjs dist/workbench-ui/mac-arm64/d-pi.app --router --attachments --workbench
```

构建须从实际干净源提交执行pnpm build，再electron-builder --mac --dir --config.electronDist=node_modules/electron/dist --config.directories.output=dist/workbench-ui，并核实包内commit/dirty与asar哈希；不可把交接文档后的HEAD标签冒称候选源。
