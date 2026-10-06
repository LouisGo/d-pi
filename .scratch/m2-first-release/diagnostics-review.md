# 基础诊断双轴独立评审

Spec reviewer `diagnostics_spec_review` 与 Standards reviewer `diagnostics_standards_review` 均独立于实现者，在固定只读checkout审查全部34差异文件；实际merge-base与base一致。base `1c9c30afb83a01531b11b02d30f2dd8f7ff6f586`，首次head `00bc76533b1a27a4b4d0397883947bf2b07e42a3`，追加6文件产品修正至 `ba0e7df1511b15932d293679959c2b594c3ea29c`，再追加harness `49cfaa3` 的5行等待修正。初末checkout干净，未修改源码、票或提交。

两轴最终均为 **0项确认的高价值问题**；未由作者自审替代独立评审。源级静态审查与主Agent实际macOS验证分别记录，reviewer未自行运行测试或原生候选。

## Spec 轴

依据当前用户要求、status/spec/06e–g、D-21/D-22、诊断合同与首版V1-00，而非历史授权或作者结论。覆盖当前34文件及追加范围：规格/票/看板、模块及生成依赖、合同/版本、shared DTO/i18n、Main IPC与装配、preload、正式GUI/查询/反馈/样式/入口、读取器/测试和两份validation harness。

核对有界七类筛选与记录上限、坏行/尾行/轮转/不可读/预算缺口、白名单与SQLite cause code、真实Writer/trace/Thread及接受/结果两事实；Main保存取消/0600私有临时文件/源文档代次/失败归一化，preload shape/trace/filter关联；全局/故障trace入口、旧采样、无重试导出、反馈复制、焦点及迟到scope隔离。确认整体V1-00/B6与M2状态没有被本切片关闭。

## Standards 轴

依据code-review/TypeScript/state-query/headless/design-system/impeccable skills，app/platform/shared AGENTS与诊断/基础/TypeScript/状态/设计合同。

核对Main读取与保存所有权、Renderer无Node/任意路径/任意IPC、preload严校关联；现有Writer唯一事实源、无OMP日志重建/业务恢复写入；文件/目录/字节/行/单行/时限预算、让出事件循环、句柄释放、拒绝symlink/非普通文件、不等待drain；已知字段与错误码白名单，不用宽正则保留自由内容。导出wx/0600/rename、异步后的frame/URL/process/routing/generation检查及临时文件清理；只读Query离线可读/无轮询重试/scope与GC，业务生命周期独立；统一token/密度/语言/选择策略及由用户审阅提交的反馈。Harness隔离数据和配置，区分真实提交、合成脱敏和原生检查点。

## 修正与独立追加复核

主Agent完整check发现SSR无window问题，默认桥接改为安全读取；主动验证真实SQLite `ERR_SQLITE_ERROR/errcode=1` 后按红绿保留已知原因码。两轴追加审查覆盖全部6文件，对有限已知码/安全数字后缀、SSR默认桥接及测试证据未发现新增高价值问题。

首轮包失败DOM为第二scope的typed busy和刷新提示；Main两次读取均completed，约263.56/260.24ms。两轴独立判断是harness仅等面板就apply导致与自动采样重叠；超时等的是成功快照，不是扫描读取器超时。49cfaa3等待初始采样完成，没有修改产品/桥接、删除失败或放宽9MiB输入/8MiB扫描/结果上限/GUI缺口断言。用户读取中换scope仍可能busy，迟到隔离与Main拒绝/后续重试由独立行为测试证明；不外推任意并发必成功。

主Agent随后在同一clean ba0e7df产品包完成21项实际macOS检查，[机器证据与交接](diagnostics.md#候选与验证)。本审查支持基础闭环的源码符合性，不证明完整span/指标/B6性能、故障全集或用户认可；acceptance pending。
