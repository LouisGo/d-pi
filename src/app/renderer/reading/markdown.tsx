import { code } from "@streamdown/code";
import { type ComponentProps, memo } from "react";
import { parseMarkdownIntoBlocks, Streamdown } from "streamdown";
import { WebsiteIcon } from "@/components/icons/common";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { urlBrand } from "../components/url-display";

// Keep remote resources inert. Native text can be copied; only an explicit app action may open a URL.
const plugins = { code };
const components = {
  img: MarkdownImage,
  a: MarkdownLink,
};

function markdownBlocks(text: string): string[] {
  // 2.6.0 keeps footnotes together, but ordinary reference definitions otherwise
  // get parsed apart from their uses. Conservatively give those bounded short
  // documents one parse scope; Markdown itself decides whether a match is valid.
  return text.includes("]:") ? [text] : parseMarkdownIntoBlocks(text);
}

function MarkdownImage({ alt }: { alt?: string | undefined }) {
  const { t } = useI18n();
  return (
    <span>
      {t("ui.conversation.image", {
        alt: alt ?? t("ui.conversation.imageNotLoaded"),
      })}
    </span>
  );
}

function MarkdownLink({ children, href }: ComponentProps<"a">) {
  return (
    <span title={href}>
      <WebsiteIcon brand={urlBrand(href ?? "")} />
      {children} {href && <code>{href}</code>}
    </span>
  );
}

export const Markdown = memo(function Markdown({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <Streamdown
      data-selectable
      plugins={plugins}
      controls={false}
      // Streamdown's static branch replaces the block tree on message_end.
      // Keep its block identities while disabling remend for final/interrupted text.
      mode="streaming"
      parseIncompleteMarkdown={streaming}
      parseMarkdownIntoBlocksFn={markdownBlocks}
      isAnimating={streaming}
      components={components}
    >
      {text}
    </Streamdown>
  );
});
