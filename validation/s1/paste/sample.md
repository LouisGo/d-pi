**会被引导完成这个流程，但不会自动调用名为 `to-spec`、`to-ticket` 的特定 skill。**

目前仓库的引导链是：

**AGENTS.md → 功能开发 skill → 本地任务约定 → 当前 Spec 与 Tickets。**

它要求 AI：

1. 先读取或补齐当前切片的 Spec。
2. 重要产品判断先与你同步，未确认前不实施依赖部分。
3. 将明确的工作拆成有依赖、验收条件的 Tickets。
4. 按票推进，更新状态，再逐段交付你试用。

特定的 `to-tickets` 工具目前是可选的，**规格和拆票这两项工作并非可选**；已有合格产物则复用，不重复生成。

对于 **S1，这个过程已经完成**：[S1 Spec](/Users/louistation/MySpace/Life/d-pi/.scratch/m1-s1-project-draft/spec.md)和四张任务票都已提交。新会话应先核对它们，再从 01 开始；如果验证导致 Spec 改变，就同步更新相关票，涉及重要产品选择仍须先问你。