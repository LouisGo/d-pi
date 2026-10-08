## Summary

完整合入 Composer M1/M2 及用户反馈修复：`@` 补全保持真实 editor/caret/来源边界；异步导入按原位置、批次顺序、取消与采用资格处理；连续输入表面组合模型、权限、维护入口。图片独立于正文 Undo，其他文件按 MIME 内联并参与 Undo，当前采用去重；日常保存安静运行，失败和待处理来源可恢复。

带图提问不再把 Base64 放入 App 冻结收据与有界传输：原件二进制保存，新收据持有资源摘要/长度，仅临近 OMP 边界编码。公共压缩工具使用独立二进制 Bun worker、有界队列/像素/次数；小图保留原字节，超限图片生成派生对象并保留原件。共享焦点入口在鼠标附件选择回到同一 editor 时保留来源，Tab/独立无障碍焦点继续可见。

范围为 [规格](spec.md)的 01–09，原完整来源 `a9cf9a9..eb2e79c` 的 **37 个提交全部保留**，另含 `ace6a19` 的整段评审收尾：重复确认已有 `@` 候选会消费准确 trigger、支持独立 Undo，不影响普通重复附件选区；校正共享 token 别名门禁和旧集成夹具。目标本地 main `cb233c6`；其两个独有提交只含既有本地合并记录，无生产差异冲突。最终合入身份见 [本地合入记录](local-merge.md)。

## Evidence

- 最终行为与验证源码固定于 `ace6a192ab01b2213c1fdefa26c4440b13545d13`。完整 `pnpm check --maxWorkers=4` exit 0：所有类型、Biome、design/i18n、source/架构/文档/生成报告门禁通过；架构 35、tooling 113、应用 1319 项通过，2 项按既定条件跳过。`pnpm build` exit 0。原始 [完整检查](evidence/local-pr/check-complete.txt)、[构建](evidence/local-pr/build-final.txt)、[来源](evidence/local-pr/provenance.md)。
- 整段独立 Spec/Standards 覆盖 `a9cf9a9..ace6a19`，重复 `@` P2 经真实红→绿关闭，最终无未关闭高价值发现。[评审](review.md)、[红例](evidence/local-pr/duplicate-reference-red.txt)、[19 项定向通过](evidence/local-pr/integration-fixes-green.txt)。此前各阶段实现、红绿和原生观察仍按 [验证](validation.md)分层保留。
- 初次完整检查的失败没有隐藏：[旧门禁失败](evidence/local-pr/check-full.txt)、[旧夹具失败](evidence/local-pr/check-full-final.txt)。token 别名 2 项正负测试保留拒绝独立值/未知引用/共享 token 覆盖。PM Undo/lease/GC 夹具使用非图片文件，历史 24 项通过，符合图片独立历史。固定官方 CLI 的 source fixture 从已安装包读取，精简 SDK 的 packaged 路径不变。
- 真实 PDF Main freeze/recopy/GC 14 项通过：使用完整独立 SDK clone，保留内部相对链接和真实路径身份断言，避开运行 App 的资源占用，不修改生产 guard。公共图片 codec 另有此前固定真实 Bun worker 7 项证据。[PDF](evidence/local-pr/pdf-isolated-green.txt)、[图片来源](evidence/image-input/provenance.md)。

本轮未启动 GUI/Dev/E2E，没有真实 Finder 事件 trace、IME/VoiceOver/长期性能或真实 Host/provider 发送结论。模拟鼠标回返的自动化通过不等于用户实机 outline 验收；acceptance 仍 pending。已知 React act、路由工具循环依赖及构建 chunk 提示保留，未造成检查失败。仅本地 PR/merge，不 push、不创建远端 PR。

## Merge Danger

影响 Renderer 编辑与共享焦点、Main 私有资源/lease/导入、FrozenSubmission 及 Host/SDK 输入边界。保留 Draft v1、数据库 schema、原有身份、信任与权限、ACK 原子事务、unknown 不自动重发和 native queue；不引入新依赖。来源 ID 与对象摘要分离，不能按共享摘要混并来源。压缩有界且原件保留，不能将自动化预算测试当作峰值 RSS/实机性能测量。

旧 inlineBase64 收据继续可读，但旧版本不一定理解新 resource 收据或派生信息，所以代码 revert 不能等同持久数据降级；回退前保留 App 数据和对应 SDK，并核实新收据兼容，不删除数据库或私有对象恢复旧版。当前整段没有新增 DB migration。合入是工程交付，不关闭产品验收父范围、不改变用户认可状态。
