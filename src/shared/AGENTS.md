# `src/shared` 规则

- 只放稳定、纯的跨域值对象、消息合同、i18n formatter/catalog 和文本基础；不放 Electron、Node、React、Monaco 或 OMP 运行时。
- shared 不是默认的公共垃圾桶。新增内容必须说明唯一事实和实际消费者，并登记公开入口与依赖变化。
- d-pi 自有展示文案由 shared i18n formatter 解析；SessionHost/OMP 不格式化用户内容或原生事件。
