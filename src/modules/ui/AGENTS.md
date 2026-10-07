# UI 模块

仅拥有跨模块使用的 Renderer 控件、表单与配置布局，公开面 renderer/public.ts。文案和真实状态由消费者传入；不调用 IPC、不创建业务 store、不依赖 app 或其他领域。外部 UI 类型和部件封装在内部。颜色/尺寸引用 App 统一 token，样式由应用入口一次加载。App 专用图标与 Modal 暂留原拥有者。
