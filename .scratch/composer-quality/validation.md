# Composer 验证记录

基点 `a9cf9a9d`。最终行为源码 `3b932e04`，动态引用预览 `36121ea`；共享 thumbnail 样式 `ac6330a4`。Node 24.21.0、pnpm 12.8.1、Electron 44.4.5、SDK 18.4.6、macOS arm64。测试边界与原生观测分别列示。

## 自动化

| 检查 | 实际结果与证据 |
| --- | --- |
| 本轮较早的 `pnpm check` | 类型、Biome、design/i18n、设计负例、source boundaries、architecture/documentation/structure/status、35 architecture tests、108 tooling tests 通过；Vitest 1181 passed / 2 skipped / 1 failed，见[完整输出](evidence/check-full.txt) |
| `pnpm check:fast` | 最终交接文档及生成报告后全部通过，见[输出](evidence/check-fast.txt) |
| 最后 main / renderer 类型 | `pnpm typecheck:main`、`pnpm typecheck:renderer` 通过 |
| `pnpm build` | 成功，保留 Zod 注释和 chunk size 警告，见[输出](evidence/build.txt)；非打包/签名证据 |
| 映射原位置与资源 | 真实 PM 25 + Main import operations 6 通过，见[输出](evidence/origin-main-green.txt) |
| 最后导航 fence | 2文件5测试通过，见[输出](evidence/ipc-green.txt) |
| PDF GUI | 原job确为 pdf-coverage-gap 后，缺确认按钮失败→同ID预览/确认/显式插入成功，真实 Composer 22通过；[red](evidence/pdf-ui-red.txt) / [green](evidence/pdf-ui-green.txt) |
| 显式插入焦点 | 按钮先获焦，采用后正文有token但焦点body失败→成功回editor；真实 Composer+PM 47通过；[red](evidence/explicit-focus-red.txt) / [green](evidence/explicit-focus-green.txt) |
| 动态项目预览 | 新10项包含真实文件/目录、越界symlink、Thread失效、25MiB拒绝、64KiB UTF-8截断及不冻结资产；主树相关5文件38通过，见[输出](evidence/reference-preview-green.txt)。[red](evidence/reference-preview-red.txt)/[worker green](evidence/reference-preview-worker-green.txt)为独立snapshot证据复跑，非未保存的首次stdout，见[说明](evidence/reference-preview-replay.txt) |
| 原生 dialog 关闭 | 按钮/cancel原先在节点断开后才close，两项红→同步释放modal后正文focus；Controls/Composer/reference 3文件47通过，见[red](evidence/modal-focus-red.txt)/[green](evidence/modal-focus-green.txt) |
| UI detector | 指定变更UI未发现问题；首次多出错误 styles.css 路径，已对实际 shared button.css 单独补查；[结果](evidence/impeccable.json)。未关闭design lint |

全量日志对应较早组合阶段，后续修复按风险运行受影响回归与类型/build/fast门禁，未把该全量数字冒称最后固定源码的全量重跑。完整检查最后失败的唯一 Vitest 为 `tests/integration/configuration-sharing.integration.test.ts`：`validation/m2/configuration-sharing.mjs:355` 请求 SDK `dist/cli.js`，`scripts/runtime/sdk-packaging.mjs:72` 对18.4.6明确将其作为 cli-bundle 剔除；这两文件相对本切片基点未改动。没有复制假CLI或改fixture掩盖失败。

环境工具检查使用声明版本。Corepack 在隔离目录默认尝试未缓存版本，且 tooling 的“缺少 pnpm”负例会把 Node 同目录 shim 当作可用工具；本轮以临时独立目录的相同 Node 二进制、固定 pnpm12.8.1 wrapper 执行检查，不改仓库或系统配置。对应日志报告 exact dependencies 48/48；fast tools-only 跳过 native inspection，不据此宣称完整环境检测通过。

## 原生 Dev

`pnpm dev` 从新工作树启动。较早整段交互验收 Main 身份为 `28bacd6c-6e743975`，process `c098c151-0ab9-4ccc-8bca-02aa590ba828`；之后仅共享 thumbnail CSS 热更新至 `ac6330a4`，没有行为模块再加载。Thread A `7ba9898c-1046-452f-86b7-87c868a40d0e`，B `20fd4c35-2a2e-4f13-b4de-b818fa475dce`，目录 `/private/tmp/dpi-composer-native`。只保存这两个fixture的附件阶段日志，见[native events](evidence/native-events.jsonl)。已有截图在本会话 CUA 工具结果中直接显示，未伪造导出文件。

- @src/ → Down → Enter →立即输入B：候选beta.ts被采用，B保留。Escape后同token追加字母不重开；新token重开。Tab从popup正常到模型按钮。
- 中文“原生验收 A”普通粘贴、保存后重启恢复成功。Ctrl+Space/逐键尝试只得到Latin nihao，没有观察到输入法marked-text，故真实IME未验证。自动化覆盖view.composing、event.isComposing、229及repeat/popup/send优先级。
- 无效pixel.png显示明确invalid-image；移除仅移除该chip、正文保留。有效sample.png通过原生选择器导入，AX与画面可见缩略图；真实预览含图像与缩放控件。
- 关闭预览→直接Cmd+Z：图片消失，中文正文完整；Cmd+Shift+Z恢复。创建B草稿后回A，图片/正文恢复，B未串入A。history-open/update均有Main完成ACK。
- light/dark画面核对popup靠近caret、候选高亮与实际thumb。发现pill继承后仅修sharedsize，最终圆角矩形视觉确认。未做无关持续打磨。

最终 `3b932e04` 重新启动 Dev（源码已提交，dirty仅交接文档/生成报告），Main身份 `3b932e04-dirty-5236577f`，process `bd34346c-2905-4ffb-91bd-99a3bf900d5f`。动态beta.ts显示 `export const beta = 2;`，src目录显示alpha.ts/beta.ts直接条目；目录关闭按钮与Escape、文件Escape均由AX确认焦点回正文、内容保留。此前36121ea原生目录关闭焦点落HTML，被3b932e04修复并重验。[最后fixture阶段日志](evidence/native-preview-events.jsonl)只证明Main阶段/身份，内容与焦点来自本会话CUA结果。最终新增截图请求因ScreenCaptureKit -3811失败，未把AX文本冒称截图。

早期边实现边热重载出现history-open/update reference-denied；当时不能归因为单一导航事件。固定代码重新启动后租约成功，没有复现。保留真实失败与证据差异，不把单位测试的导航fence当作该运行时失败的确定根因。

未运行：真实CJK组合态/VoiceOver/200%缩放/窄窗/30min性能、OS文件mixed paste/drop竞态全集、实机PDF确认、个人账户/provider请求、真实Host queue发送、打包/签名/远端CI。工程验证不等于用户认可。
