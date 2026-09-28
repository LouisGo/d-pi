# 04 历史 busy 语义复核

Status: open

对应审计 D3。复核结论（待实现批确认）：`history:read` 走原生文件直读，不经 RPC `get_messages_page`；streaming/compacting 期间返回分页或 `changed`，`error` 仅抛错时出现，从未把 busy 显示成无历史。是否新增 busy 分支需 Main 执行态 plumbing 与合同变更，先复核真实用户影响再定，不在本批硬加。
