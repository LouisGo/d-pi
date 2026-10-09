// Synthetic content; production views, model subscriptions, composer and theme.
import type {
  ConversationEvent,
  ConversationItem,
  HistoryEntry,
} from "../../src/modules/conversation/contracts/public";
import darkImage from "./fixtures/conversation-dark.png?inline";
import lightImage from "./fixtures/conversation-light.png?inline";
import { bridge, mountRenderingFixture } from "./rendering.js";

const fileContent =
  "# 会话展示\n\n图片放在气泡上方，保留真实的发送时间。\n\n这份内容是发送时冻结的文件副本。";

const entries: HistoryEntry[] = [
  {
    id: "user-1",
    parentId: null,
    role: "user",
    text:
      "帮我梳理会话展示的组件，先让消息更容易阅读。\n\n[conversation-notes.md]\n" +
      fileContent +
      "\n[/attachment]\n",
    displayText: "帮我梳理会话展示的组件，先让消息更容易阅读。",
    images: [
      {
        index: 0,
        mimeType: "image/png",
        digest: "a".repeat(64),
        name: "conversation-light.png",
      },
      {
        index: 1,
        mimeType: "image/png",
        digest: "b".repeat(64),
        name: "conversation-dark.png",
      },
    ],
  },
  {
    id: "answer-1",
    parentId: "user-1",
    role: "assistant",
    thinking:
      "先明确内容层级：用户输入、模型回复、工具结果与操作入口。阅读状态独立于执行状态。",
    text: "可以，从阅读体验开始。\n\n用户输入会放在右侧气泡里，回复保留自然的段落和留白。工具调用收成摘要，展开后仍能查看完整输出。",
  },
  {
    id: "tool-1",
    parentId: "answer-1",
    role: "toolResult",
    text: "src/app/renderer/reading/conversation.tsx\nsrc/app/renderer/workbench/composer.tsx",
    toolEvidence: {
      toolCallId: "synthetic-call",
      toolName: "read",
      effect: "no-mutation",
      isError: false,
      coverage: "text-parts-only",
      nonTextParts: 0,
    },
  },
  {
    id: "answer-2",
    parentId: "tool-1",
    role: "assistant",
    text: '### 一条连续的阅读线\n\n消息与输入框共享内容宽度。长回复中保留标题、列表和代码的层级，操作只在需要时出现。\n\n```ts\nconst conversation = {\n  user: "bubble",\n  assistant: "document",\n  tools: "disclosure",\n};\n```\n\n复制按钮保留键盘入口，工具详情不会打断正常阅读。',
  },
  {
    id: "user-2",
    parentId: "answer-2",
    role: "user",
    text: new URLSearchParams(location.search).has("anchor-preview")
      ? "多轮对话要有锚点定位。\n\n" +
        "悬停时通过小卡片预览完整提问，原文换行需要保留。长内容可以在卡片内滚动；鼠标移入卡片时应保持展开，定位不会被新的流式输出打断。\n\n".repeat(
          6,
        ) +
        "最后一行：图片与附件仍放在用户气泡上方。"
      : "多轮对话要有锚点定位。\n\n长内容和窄窗口也需要处理好，不要让 hover 的背景或文字溢出。",
  },
  {
    id: "answer-3",
    parentId: "user-2",
    role: "assistant",
    text: "会在左侧提供轻量轮次导航。\n\n- 悬停或键盘聚焦时，可以预览这一轮的问题。\n- 点击即可回到该轮输入，继续流式输出不会抢走位置。\n- 离开底部时，会出现回到底部的入口。\n\n窄窗口保持同一条对齐线，较长的路径与代码在自己的区域内换行或滚动。",
  },
  {
    id: "user-3",
    parentId: "answer-3",
    role: "user",
    text: "好，开始打磨这些细节。",
  },
];
let receive: ((event: ConversationEvent) => void) | undefined;
const generation = crypto.randomUUID();
let seq = 0;
let live: ConversationItem = {
  id: 100,
  role: "assistant",
  state: "streaming",
  label: { kind: "literal", text: "OMP" },
  text: "正在整理最后一轮的消息展示。",
  thinking: "核对对齐、悬停操作和阅读锚点。",
  timestamp: Date.parse("2026-10-09T09:30:00Z"),
};
const first = entries[0]!;
const start = first.text.indexOf(fileContent);
first.files = [
  {
    name: "conversation-notes.md",
    byteLength: 161,
    start,
    end: start + fileContent.length,
  },
];
const runtimeRequest = bridge.runtime!.request;
bridge.runtime!.request = async (command) => {
  const reply = await runtimeRequest(command);
  if (reply.kind !== "view") return reply;
  return {
    ...reply,
    view: {
      ...reply.view,
      connectionGeneration: generation,
      busy: command.kind !== "stop",
      control: {
        paused: false,
        stopping: false,
        pendingAsync: false,
        admitted: false,
        streaming: command.kind !== "stop",
        compacting: false,
        queued: 0,
        background: 0,
        queue: [],
      },
    },
  };
};
bridge.history = {
  image: async (_thread, _cursor, _record, index) => ({
    kind: "image",
    dataUrl: index === 0 ? lightImage : darkImage,
  }),
  read: async (threadId) => ({
    kind: "page",
    entries: entries.map((entry, index) => ({
      ...entry,
      timestamp: Date.parse("2026-10-09T09:00:00Z") + index * 60000,
      ...(entry.images
        ? {
            mediaCursor: {
              threadId,
              source: "fixture-media",
              offset: 0,
              endOffset: 1,
              prefixHash: "a".repeat(64),
            },
          }
        : {}),
    })),
    source: "synthetic-display",
    coverage: "append-order",
    next: null,
    omitted: 0,
    incompleteTail: false,
  }),
  projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
  projectList: async () => ({ kind: "catalog", sessions: [], partial: false }),
};
bridge.conversation = {
  connect(_thread, listener) {
    receive = listener;
    listener({
      kind: "snapshot",
      connectionGeneration: generation,
      seq,
      items: [live],
      gap: false,
    });
    return () => {
      if (receive === listener) receive = undefined;
    };
  },
};
Object.assign(window, {
  displayProbe: {
    locale: () => bridge.locale!.setPreference("zh-CN"),
    append: () => {
      live = {
        ...live,
        text: live.text + "\n\n" + "新增的回复段落。".repeat(150),
      };
      receive?.({
        kind: "update",
        connectionGeneration: generation,
        seq: ++seq,
        item: live,
        droppedBefore: 0,
        gap: false,
      });
    },
  },
});
mountRenderingFixture();
