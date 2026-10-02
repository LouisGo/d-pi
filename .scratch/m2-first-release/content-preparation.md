# M2 附件引用准备与原生队列内容

2026-10-02。用户授权最近可交付04a/05c切片、三名开发subagent、主Agent整合、TDD、macOS隔离验证、独立review、试用候选与本地commit，不push。已有环境对齐改动保留并排除提交。

## 实现与体验

文件选择/粘贴/拖入在Thread下准备私有原件，草稿只保存原子短引用；可预览、缩放、重排、移除及显式重试。尚未落盘的原件在关闭时受保护，切换Thread不取消导入；迟到导入留在原Thread文件库。@项目文件支持键盘候选与含@路径，标注发送时读取；Main每次准备核实项目权限和真实身份后冻结。

冻结内容保留实际文字、图片、摘要、来源与转换版本，prepared/dispatching仍先持久化，ACK仅消费对应草稿。当前模型和真实传输不能保留图片时明确拒绝；真实UTF-8/Base64/JSON编码超限完整保留输入，预览截断不影响发送。显式重发使用原冻结内容；unknown不自动重发，冷旧Thread只读。

原生队列单文字+图片/纯图片可编辑文字并保留图片，显式选择移除某张；真实图片身份、编辑暂缓、消费竞争、删除及重排由OMP拥有。复杂伴随/custom内容仍明确只读并原样保留，App不维护另一份队列；原冻结submission不覆写。

PDF使用固定OMP18.4.6原生文字转换，展示扫描/图表覆盖缺口并要求明确仅文字，不声明已完整承接页面图片。B4引用计数释放、延迟GC和全面一致性扫描尚未实现，保守保留私有原件、摘要去重，1GiB满时明确拒绝新增；父04/05和M2仍未全集完成，用户认可pending。

## 验证与交付

完整 `pnpm check` 通过654项行为、34项架构、65项工具测试，1项既有CLI artifact opt-in跳过；类型、设计/i18n、文档/结构/状态门禁通过。实际localhost SDK队列10次请求通过，正式工作包macOS17项、最终clean包18项检查通过，仅2次localhost生成请求。独立review与主线最终边界检查共确认6个P2并修复，初轮118项、追加43项及最终导入/GUI定向回归通过，见[审查](content-review.md)。

真实红灯包含冻结content丢失、v8 manifest缺表、@图片读取失败、纯图队列无法保存、关窗丢未落盘来源、queue_change遗漏previousImages；对应最小实现转绿。既有正确行为补测与fixture错误不冒称产品红灯。大文本预览跨真实preload和Main，超过真实编码预算不发送预览截片。

首轮fixture有损坏PNG、错误DOM文字等待/同名文件面板点击及旧的零journal假设，均在实际证据上修正验证。批量CDP newline insert后的cursor会位于末字前；改为真实Shift+Enter后@插入已精确覆盖整段query并无残字，此时未确认产品缺陷。实际包发现的图片变更来源持久化缺口则补失败测试修产品，并独立复核。截图发现预览modal受全局重置影响，已修居中、共享overlay、可访问文件名及关闭焦点；选择文件准备失败保留具体原因，连接异常才显示transport失败。正式splitBlock与前置atom的@补测通过。最终clean包已断言modal居中及视口内，主Agent核对最终实际截图。

工作区完整检查沿用用户原环境对齐文件，不将这些未提交改动纳入产品或声称clean原环境门禁已通过。最终候选从本轮commit的独立clean checkout构建，身份与ZIP同源验证通过，详见下方候选。

最终新增边界修正：Base64校验改为严格规范roundtrip，预算内6MB原件可私有复制并保持ready，发送仍按1MiB实际编码拒绝；正式GUI分别保留必需导入/引用失败和普通操作反馈，其他预览/准备成功失败均不能清除原失败，只有对应明确重试成功或移除才解锁。

## 候选与试用

已交付待试用：`0.1.0-m2.13 / 7f5d5909-ac115847`，源码 `7f5d59099e2d01f9c0e77c80e389c15c5439148c`，clean build（dirty=false）。这是本机 macOS arm64 未签名开发候选，用户认可仍pending。ZIP路径、SHA256、大小及app.asar同源信息见 [候选身份](evidence/content-candidate.json)。应用路径 `dist/content-m2.13-clean/mac-arm64/d-pi.app`；ZIP `dist/candidates/d-pi-0.1.0-m2.13-7f5d59-mac-arm64.zip`。

试用步骤：

1. 打开已明确授权执行的项目，创建独立新Thread。通过“添加附件”、图片粘贴或拖入文本/图片，核对准备状态、预览/缩放、重排与移除；准备失败后草稿保留，可明确重试或移除。
2. 输入 `@` 搜索项目文件，选择后显示短引用及“发送时读取”；修改源文件后再发送应冻结新版本。准备或实际编码预算失败须完整保留草稿，不只发送预览片段。
3. PDF先预览抽取结果，核对覆盖缺口，明确选择“仅使用抽取文字”后才发送。需要完整页面视觉/OCR的任务暂不由当前候选承诺。
4. 选支持图片的现有可用模型后发送。执行中继续带图排队，编辑文字时默认保留图片，可明确移除某张；保存/删除/重排应保持原生队列身份、伴随信息与变更记录。复杂原生custom内容显示只读。
5. 切换Thread、Renderer重载及冷重开：独立草稿/身份保持，unknown不自动重发，冷旧Thread只读；继续执行使用明确独立新Thread出口。

最终验证使用实际Electron、固定Bun/OMP18.4.6与localhost确定供应商；18项检查、2次生成请求，隔离HOME/config/App数据/Git/项目，没有个人凭据或真实供应商计费。覆盖6MB原件Base64边界、真实PDF文字转换与覆盖准入、图片解码/不支持模型拒收、@搜索原子插入、实际图片+引用送达、队列图片编辑来源持久化、长队列拒收保留、双scope切换/重载/冷只读。主Agent核对最终PDF居中预览、准备后草稿、带图队列编辑和编码超限截图；证据见 [包内结果](evidence/content-clean-package-result.json)及同目录 `content-clean-*.png`。

最终常规布局测得阅读区101.5px、编辑器522.3–586.3px、发送动作底部720px，视口748px；该样本只证明已测布局与操作可达，不是完整长对话/附件密集布局性能矩阵。Chromium组合输入已测，当前未重跑系统输入法与macOS红色关闭按钮全矩阵；未落盘来源关闭保护有正式AppModel/GUI边界回归。PDF完整视觉/OCR、B4引用释放/延迟GC/全面扫描及完整子Agent生命周期留父票继续，不冒称M2全集通过。

clean checkout构建未包含原环境对齐文件；`electron-vite build`与`electron-builder --mac --dir`通过。临时checkout的Corepack入口错误时，仅在该打包进程PATH放置核实为Mach-O arm64的原生pnpm12.8.1临时入口，未修改个人环境、版本门禁或tracked依赖配置。工作区完整检查沿用原有环境对齐文件，故不把clean候选构建说成clean原环境门禁通过。打包/构建日志见 [构建](evidence/content-clean-build.txt)和[打包](evidence/content-clean-pack.txt)。
