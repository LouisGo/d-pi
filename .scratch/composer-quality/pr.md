## Summary

普通约887KiB图片因提前Base64超过App旧1MiB门槛而失败。改为私有二进制原件、不可变资源引用和OMP边界编码，App收据及管道不重复复制图片字符串。公共Node压缩工具通过独立Bun worker处理超限图片，二进制IPC、有界资源，小图保留原字节；转换信息与实际派生预览一致，动画不静默扁平化。[规格](spec.md)、[07票](issues/07-image-input-budget.md)。

## Evidence

基点25e8c58，分支codex/composer-quality，仅本地。初始容量、资源表示、水合/停止及评审@连续准备反例先失败后修复。最终34文件299项、tooling111、architecture35项通过；完整typecheck/fast/design/i18n/build与SDK同步/hash/环境通过。两轴独立评审复核后无剩余高价值问题。[来源记录](evidence/image-input/provenance.md)、[验证](validation.md)、[评审](review.md)。

未运行GUI/Dev/E2E、真实Host/provider；用户实机与视觉/压缩质量验收pending。只有payload大小对照，没有完整RSS/吞吐基准。完整check未重跑，先前SDKPDF/CLIfixture失败unknown继续保留。

## Merge Danger

新代码兼容旧Base64收据，旧代码不识别新资源引用；Main/Renderer/宿主及SDK资源须同版交付。无新增依赖/DB迁移/执行权限，但新增派生资源进入原有租约与清理保护。源25MiB/总100MiB预算保留，单图10MiB/图总40MiB/内部JSONL64MiB为App政策，不冒称provider限制。

revert不会撤销已保存收据、原件/派生物或OMP副作用，降级须保留数据并恢复匹配源码，不能清库或自动重发。无push/远端PR/发布，工程完成不等于用户认可。
