# 03 派发授权排序与 Host 目录复核

Status: open

对应审计 A9/A12/A15/A16。需变更：Main `submit()` 对 dispatch 快返路径同样先过目录/授权校验；Host `dispatch` 复核目录身份（Host 合同加字段）；stop/continue 操作关联派发 ID 或等价因果；control `operation-result:acknowledged` 与版本守卫对齐。面大且涉跨进程合同，另批实施，本轮只记录。
