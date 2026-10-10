import { useRef } from "react";
import { createRoot } from "react-dom/client";
import "../../src/app/renderer/styles/app.css";
import type { ConfigurationSnapshot } from "../../src/modules/configuration/contracts/public";
import { ModelPickerPanel } from "../../src/modules/configuration/renderer/public";
import { I18nProvider } from "../../src/modules/preferences/renderer/public";
import { Button, Popover } from "../../src/modules/ui/renderer/public";

const models: ConfigurationSnapshot["models"] = Array.from(
  { length: 30 },
  (_, index) => ({
    provider: ["openai-codex", "anthropic", "deepseek"][index % 3]!,
    id: `model-${index}`,
    name: `Model ${index}`,
    available: true,
    reason: null,
    kind: "chat",
    reasoning: true,
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 32000,
    thinking: {
      efforts: [],
      adjustable: false,
      requiresEffort: false,
      defaultEffort: null,
      defaultLevel: null,
    },
  }),
);

function Fixture() {
  const search = useRef<HTMLInputElement>(null);
  return (
    <I18nProvider
      initialSnapshot={{ preference: "en-US", resolvedLocale: "en-US" }}
    >
      <main
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}
          id="reading"
        >
          {Array.from({ length: 100 }, (_, index) => (
            <p key={index}>Existing conversation {index}</p>
          ))}
        </div>
        <footer
          style={{ flexShrink: 0, padding: "24px", marginBottom: "40px" }}
        >
          <Popover
            label="Model picker"
            variant="flush"
            initialFocus={search}
            trigger={<Button id="choose-model">Choose model</Button>}
          >
            <ModelPickerPanel
              models={models}
              currentKey={JSON.stringify(["openai-codex", "model-0"])}
              preferences={{ favorites: [], hidden: [], order: [] }}
              searchRef={search}
              failed
              onRetry={() => {}}
              onSelect={() => {}}
              onPreference={() => {}}
              onManage={() => {}}
            />
          </Popover>
        </footer>
      </main>
    </I18nProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
