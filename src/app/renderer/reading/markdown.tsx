import { code } from "@streamdown/code";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import { WebsiteIcon } from "@/components/icons/common";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { urlBrand } from "../components/url-display";

// Keep remote resources inert. Native text can be copied; only an explicit app action may open a URL.
const plugins = { code };
const components = {
  img: MarkdownImage,
  a: MarkdownLink,
};

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
      plugins={plugins}
      controls={false}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      components={components}
    >
      {text}
    </Streamdown>
  );
});
