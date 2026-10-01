import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";
import { WebsiteIcon } from "@/components/icons/common";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { urlBrand } from "../components/url-display";

// Keep remote resources inert. Native text can be copied; only an explicit app action may open a URL.
export function Markdown({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Streamdown
      plugins={{ code }}
      controls={false}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      components={{
        img: ({ alt }) => (
          <span>
            {t("ui.conversation.image", {
              alt: alt ?? t("ui.conversation.imageNotLoaded"),
            })}
          </span>
        ),
        a: ({ children, href }) => (
          <span title={href}>
            <WebsiteIcon brand={urlBrand(href ?? "")} />
            {children} {href && <code>{href}</code>}
          </span>
        ),
      }}
    >
      {text}
    </Streamdown>
  );
}
