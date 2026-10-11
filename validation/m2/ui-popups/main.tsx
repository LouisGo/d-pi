import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsModal } from "../../../src/app/renderer/components/ui/settings-modal";
import type { ConfigurationSnapshot } from "../../../src/modules/configuration/contracts/public";
import { ModelPickerPanel } from "../../../src/modules/configuration/renderer/model-picker";
import { I18nProvider } from "../../../src/modules/preferences/renderer/public";
import {
  createHoverCardHandle,
  HoverCard,
  HoverCardPopup,
  HoverCardTrigger,
  Popover,
  Select,
} from "../../../src/modules/ui/renderer/public";
import "../../../src/app/renderer/styles/app.css";

function Sample() {
  const [open, setOpen] = useState(true);
  const [scope, setScope] = useState("thread");
  const [many, setMany] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const preview = useMemo(() => createHoverCardHandle<string>(), []);
  return (
    <>
      <button ref={trigger} onClick={() => setOpen(true)}>
        Settings
      </button>
      <SettingsModal
        open={open}
        onClose={() => setOpen(false)}
        title="Settings"
        closeLabel="Close"
        returnFocus={trigger}
        navigation={<button>Providers</button>}
      >
        <Select
          value={scope}
          onValueChange={setScope}
          aria-label="Scope"
          options={[
            { value: "global", label: "Global configuration" },
            { value: "thread", label: "Current project configuration" },
          ]}
        />
        <Select
          value={scope}
          onValueChange={setScope}
          aria-label="Search scope"
          search={{ label: "Search scope", empty: "No scope" }}
          options={[
            { value: "global", label: "Global configuration" },
            { value: "thread", label: "Current project configuration" },
          ]}
        />
        <Popover
          trigger={<button id="model-trigger">Models</button>}
          label="Models"
          variant="flush"
        >
          <ModelPickerPanel
            models={
              many
                ? Array.from(
                    { length: 30 },
                    (_, index): ConfigurationSnapshot["models"][number] => ({
                      provider: `provider-${index}`,
                      id: `model-${index}`,
                      name: `Model ${index}`,
                      available: true,
                      reason: null,
                      kind: "chat",
                      reasoning: false,
                      input: ["text"],
                      contextWindow: 1000,
                      maxTokens: 100,
                      thinking: {
                        efforts: [],
                        adjustable: false,
                        requiresEffort: false,
                        defaultEffort: null,
                        defaultLevel: null,
                      },
                    }),
                  )
                : []
            }
            currentKey={null}
            preferences={{ favorites: [], hidden: [], order: [] }}
            failed={!many}
            onSelect={() => {}}
            onPreference={() => {}}
            onManage={() => setMany(!many)}
          />
        </Popover>
      </SettingsModal>
      <div id="hover-fixture">
        <HoverCardTrigger
          handle={preview}
          payload="First preview"
          render={<button id="hover-first">First</button>}
        />
        <HoverCardTrigger
          handle={preview}
          payload="Second preview"
          render={<button id="hover-second">Second</button>}
        />
        <HoverCardPopup handle={preview} label="Shared preview">
          {(payload) => <p>{payload}</p>}
        </HoverCardPopup>
        <HoverCard
          trigger={<button id="hover-single">Standalone</button>}
          label="Standalone preview"
        >
          <p>Standalone preview</p>
        </HoverCard>
      </div>
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw Error("missing fixture root");
createRoot(root).render(
  <I18nProvider
    initialSnapshot={{ preference: "en-US", resolvedLocale: "en-US" }}
  >
    <Sample />
  </I18nProvider>,
);
