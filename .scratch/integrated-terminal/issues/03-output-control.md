# 03 有界输出与背压

Status: open
Blocked by: 02
阶段：M3。受影响决定：D-21/D-22/D-40。

授权见[spec](../spec.md)；预算与行为单源为[契约 §5](../../../docs/architecture/terminal.md#5-输出确认背压与预算)。不要复制或擅自放宽数值。

## 行为与验收

PTY/native回调、headless待写、follower待发、port在途、Renderer待写和snapshot临时副本全部计量；UTF-8与字符串/cell扩展成本区别记录。达到高水位显式pause，低水位resume；按处理ACK释放信用，postMessage成功不能释放。browser一次一个write callback确认，受限批量/按帧让出，不向库内无限排队。

TDD用可控慢/无/伪ACK、parser停滞、pause后在途大chunk与队列超限复现；慢视图detach后Host继续消费，新snapshot明确重同步与有限覆盖；Host解析超限只结束目标终端。隐藏没有离线follower积压。控制/end/revoke不饿死，shell输出阻塞代价可见，不冒称完全不影响主页面。

按[验证设计](../../../docs/validation/terminal.md)执行持续/突发最小样本，记录水位、生产阻塞与回落；每会话硬界从未越过，screen/snapshot包含normal/alternate与长字符串扩展，不只给行数上限。诊断仅聚合计数/耗时，释放与超限失败无内存增长或假终态。
