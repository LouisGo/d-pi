# Provider / Model 品牌 SVG 来源

2026-10-08；本批品牌图标仅通过 UI Icon Layer 的 `ProviderBrandIcon` / `ModelBrandIcon` 使用。资源作为静态 React SVG 保存于 `src/modules/ui/renderer/components/icons/_brands/assets.tsx`，不安装另一个图标包、不请求远程素材、不注入 SVG 字符串。尺寸/装饰语义由封装统一，单色标识消费 currentColor，彩色标识保留品牌色。资产内部 `sourceColors` 保留原 SVG fill/stop 色值，业务消费者不接触该色表；渐变 ID 按 React 实例区分；来源中的全尺寸/布局样式已移除。

## T3 直接提取

来源：[T3 Icons.tsx](https://github.com/pingdotgg/t3code/blob/30cc788975500a8c00d32a50f348174d1ce578d1/apps/web/src/components/Icons.tsx)，本地固定 HEAD `30cc788975500a8c00d32a50f348174d1ce578d1`。原样保留 OpenAI、ClaudeAI、CursorIcon、GrokIcon 与 AppleIcon 的 viewBox/path；AntigravityIcon 保留 T3 原文件的内嵌 PNG Data URL（不是远程请求），替换 T3 的颜色类、宽 props 和通用 Icon API 为 d-pi 窄封装。T3 的这份文件没有其他常用 OMP 模型厂商资源，因此补取下方静态素材。

T3 使用 MIT；AppleIcon 的源码额外注明来自 [Simple Icons](https://github.com/simple-icons/simple-icons) 的 [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) 素材。T3 软件许可没有转让品牌商标权；这些标识只用于识别用户选中的真实供应商/模型，不表示品牌背书。

## 补充静态 SVG

来源：[Lobe Icons](https://github.com/lobehub/lobe-icons/tree/c385b2b8d1f9e19aa86e628d4e23c91ee1111a47/packages/static-svg/icons)，固定 commit `c385b2b8d1f9e19aa86e628d4e23c91ee1111a47`。仅提取以下 24 个 SVG（文件名即原路径末段）：

- `alibaba-color.svg`
- `aws-color.svg`
- `azure-color.svg`
- `cerebras-color.svg`
- `cohere-color.svg`
- `deepseek-color.svg`
- `fireworks-color.svg`
- `gemini-color.svg`
- `githubcopilot.svg`
- `google-color.svg`
- `groq.svg`
- `huggingface-color.svg`
- `kimi-color.svg`
- `meta-color.svg`
- `minimax-color.svg`
- `mistral-color.svg`
- `nvidia-color.svg`
- `ollama.svg`
- `openrouter.svg`
- `perplexity-color.svg`
- `qwen-color.svg`
- `together-color.svg`
- `xai.svg`
- `zai.svg`

Lobe Icons 的仓库 [LICENSE](https://github.com/lobehub/lobe-icons/blob/c385b2b8d1f9e19aa86e628d4e23c91ee1111a47/LICENSE) 使用 MIT，未在所取 SVG 中注明额外素材许可。MIT 覆盖这份开源素材实现，不代替各品牌的商标使用规范；未找到可信标识或不能确定模型厂商时使用无品牌的通用降级图形。

Kimi 的原始 K 主体为白色；d-pi 将这一单色主体改为 `currentColor`，保证浅色与深色界面可见。原 path、viewBox 和蓝色品牌点保持不变。

## 2026-10-09 补充 Magpie 静态标识

本轮按用户指定的 [yetone/magpie](https://github.com/yetone/magpie/blob/a8ca7908556ead568c3d3a72e6e58e7e11852caa/internal/gui/assets/app.js) 图标做法补充：单色标识继承文字色，彩色标识保留原色；同一模型列表项仅展示一个 logo。厂商不明时保留中性标识，本地模型与 Web 搜索使用对应的功能图形，不冒用 LM Studio 等产品品牌。

来源固定为 commit `a8ca7908556ead568c3d3a72e6e58e7e11852caa` 的 `internal/gui/assets/icons/`：`lmstudio.svg`、`cloudflare-color.svg`、`vllm-color.svg`、`voyage-color.svg`、`jina.svg`、`ai21.svg`、`gemma-color.svg`、`stepfun-color.svg`、`bytedance-color.svg`、`siliconcloud-color.svg`、`novita-color.svg`、`baseten.svg`、`opencode.svg`、`vercel.svg`、`venice-color.svg`、`nebius.svg`、`chutes.svg`、`deepinfra-color.svg`、`xiaomimimo.svg`。

保存于 Icon Layer 私有 `magpie-assets.tsx`，静态 React SVG 保留 viewBox/path、品牌色与填充规则；移除来源的尺寸、标题与布局 style，渐变 ID 按实例隔离。没有运行时远程图片或新的图标包。Magpie 根 [LICENSE](https://github.com/yetone/magpie/blob/a8ca7908556ead568c3d3a72e6e58e7e11852caa/LICENSE) 为 MIT；上述素材含 Lobe Icons 来源，沿用本页的 Lobe MIT 声明并在 `THIRD_PARTY_NOTICES.md` 补充 Magpie 许可。

## 保留的许可原文

### T3

```text
MIT License

Copyright (c) 2026 T3 Tools Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Lobe Icons

```text
MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
