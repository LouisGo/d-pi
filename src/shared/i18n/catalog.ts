import { domain as enDomain } from "./locales/en-US/domain";
import { main as enMain } from "./locales/en-US/main";
import { ui as enUi } from "./locales/en-US/ui";
import { domain as zhDomain } from "./locales/zh-CN/domain";
import { main as zhMain } from "./locales/zh-CN/main";
import { ui as zhUi } from "./locales/zh-CN/ui";

// Domain files are source organization only; there is one catalog per locale.
export const enUSMessages = { ...enMain, ...enUi, ...enDomain } as const;
export type MessageKey = keyof typeof enUSMessages;
export const zhCNMessages = {
  ...zhMain,
  ...zhUi,
  ...zhDomain,
} satisfies Record<MessageKey, string>;
