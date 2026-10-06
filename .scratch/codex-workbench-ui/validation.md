# A 基础布局验证

实现固定提交：8823a3b76544bfbdd8a5be1511caf2baa0e48c9e；基点37e1a62b889fdfaa1db274b60bac69b98d54d23c。

## 工程与隔离 GUI

- `pnpm check`：通过；806行为测试通过、2项既有可选原生smoke跳过；35架构测试与89 tooling测试通过。类型、Biome、设计、i18n、设计/源码边界、架构、文档、结构、状态门禁通过。
- `pnpm lint:interaction`：通过。`pnpm validate:interaction` 实际Electron通过；当前统一默认尺寸，两主题、Portal、Monaco/Diff光标、选择、复制和阅读区段原生点击。该脚本的正式API不变；证据另存本目录，历史证据保留。
- `node validation/m2/workbench.mjs`：50项通过，[原始结果](evidence/native.json)。实际Electron窗口1440×900、720×540、1920×1080；三边拖拽/阈值收起/显式恢复/取消无保存/键盘保存、缩窗不覆盖偏好、标签键盘与关闭焦点、独立底部滚动、主题颜色角色传播；原Tiptap/Thread controller/阅读viewport/Monaco实例保持；撤销重做、Chromium合成输入、设置往返阅读坐标、长草稿与中文最小窗口预算。补充custom header从原生内容顶端开始、三边收起回焦、设置期间未读保留/一级导航提示、通知打开会话、大窗口WorkArea不限正文宽度；50条记录含一次CDP输入到下一rAF的耗时采样，该采样不能证明长时帧率。
- Impeccable detect：本轮新增外壳/控件与token无主要发现，[扫描结果](evidence/design-scan.json)。

右/底样本只在validation/m2/workbench.html隔离入口注册，生产无内容时关闭；样本Monaco来自现有只读适配器，底部只是滚动文字，不是PTY。截图production-*指正式App组件但仍使用隔离业务数据，不能当真实账户/provider证据。isolated-*另外展示测试宿主。

## 缺口先失败，再修复

默认尺寸和去密度入口回归先失败后通过；几何规则先缺模块失败，模型实现后通过；直接导入面板库的架构回归先证明原门禁漏检，再加入自有adapter规则后35项通过。Electron实际暴露恢复早于库约束注册、键盘提交读取旧DOM尺寸、关闭标签丢焦点、窄窗口底部挤占阅读区，均有失败断言与针对性修复后的同一检查通过。

设置返回的最初300px断言超过fixture可滚动范围，浏览器已先夹到231px；换成合法150px并扩大隔离阅读内容验证，未将错误测试预期宣称为产品缺陷。既有schema10迁移测试改为保留旧density列，不修改或重建旧数据。

## 覆盖边界

本页是工程/隔离GUI证据。真实包与固定官方SDK、macOS标题栏控件和物理拖动仍在04验证。Chromium composition覆盖合成事件，macOS系统输入法候选窗尚未覆盖；连续流式大历史的长时拖拽帧率与低端设备性能未测，资源未重建不等于流畅度证明。没有运行用户真实账户或计费请求；未知提交不重发，旧native session冷恢复仍只读。用户试用/认可单独维护。

用户截图对应的导航位置断言 `navigation-controls-follow-native-window-controls` 在修复前返回false，修复后通过：后退、前进、侧栏开关顺序位于macOS安全区右侧，左栏顶端无区域标题，主区不重复历史控件；收起后的恢复回焦检查继续通过。

新增键盘Enter恢复侧栏保留同一导航按钮焦点、缩窗导航换位不抢Composer焦点两项检查。原生包验证Router/草稿/附件/SDK/冷恢复已在381d105的干净包通过，新焦点修复后再生成并验证最终包。
