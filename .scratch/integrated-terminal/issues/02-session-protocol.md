# 02 受限会话协议与屏幕恢复

Status: open
Blocked by: 01
阶段：M3。受影响决定：D-35/D-37/D-40。

范围/授权见[spec](../spec.md)。按[契约 §3–4](../../../docs/architecture/terminal.md#3-公开面与受限协议)接Main控制面与Renderer受限端口，固定terminal/Host/attachment身份；协议入口不暴露通用shell/kill。

## 行为与验收

- Host保序输入、resize、输出和state；inputSeq重复只返回同代次结果，ACK丢失不重放；PTY write结果与命令成功分开。
- 固定兼容browser/headless/serialize版本，Host维护有限屏幕；attach在同序列捕获snapshot/watermark，再送增量；部分ANSI尾部不能充当snapshot。缺号/旧代次/实例不符触发有界重同步。
- 同票最小验证查询应答单写隔离、normal/alternate screen、宽字符/combining与resize后连续增量一致性；固定库无法支持恢复或硬界时保留明确技术缺口，不靠重启shell掩盖。
- TDD覆盖并发端口交错、旧端口输入、重复请求、UTF-8/ANSI跨块、尾部exit与watermark，元数据不跨目录串线。隐藏/重挂载不创建或结束shell，快照确认前不可写。

Host是输出/屏幕水位拥有者，Renderer只是mirror；输出不进入通用store/Query。释放端口、decoder、headless、未确认请求时不删除Main清理未知的登记。自动化与真实PTY重挂载结果分开记录。
