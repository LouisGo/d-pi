import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ActionMenu } from "../../src/app/renderer/components/ui/action-menu";
import { HoverMenu } from "../../src/app/renderer/components/ui/hover-menu";
import {
  Button,
  CheckIcon,
  ChoiceGroup,
  Disclosure,
  DisclosureTrigger,
  EmptyState,
  InlineNotice,
  installControlFocusVisibility,
  OptionAction,
  Select,
  SettingRow,
  SettingsGroup,
} from "../../src/modules/ui/renderer/public";
import "../../src/app/renderer/styles/app.css";

installControlFocusVisibility(document);

const options = [
  { value: "standard", label: "Default" },
  { value: "fast", label: "Fast" },
  { value: "off", label: "Reasoning off" },
  { value: "blocked", label: "Unavailable", disabled: true },
];
function Fixture() {
  const [value, change] = useState("standard");
  return (
    <main style={{ padding: 32, display: "grid", gap: 24 }}>
      <div>
        <Select
          id="top"
          value={value}
          options={options}
          onValueChange={change}
          aria-label="Speed"
        />
      </div>
      <div>
        <ChoiceGroup
          value={value}
          options={[options[0]!, options[1]!]}
          onValueChange={change}
          aria-label="Mode"
        />
      </div>
      <div>
        <Select
          id="search"
          value={value}
          options={options}
          onValueChange={change}
          aria-label="Model"
          search={{ label: "Search models", empty: "No matches" }}
        />
      </div>
      <div style={{ position: "fixed", bottom: 16, right: 32 }}>
        <Select
          id="bottom"
          value={value}
          options={options}
          onValueChange={change}
          aria-label="Bottom speed"
        />
      </div>
      <section data-detail-fixture style={{ width: 240, maxWidth: "100%" }}>
        <SettingsGroup>
          <SettingRow label="Account actions">
            <Button>Reconnect account</Button>
            <Button>Remove account</Button>
          </SettingRow>
        </SettingsGroup>
        <Disclosure variant="framed">
          <DisclosureTrigger>{"longtoolname".repeat(8)}</DisclosureTrigger>
          <p>Tool details</p>
        </Disclosure>
        <EmptyState
          title="No project"
          description={"longprojectdirectoryname".repeat(6)}
        />
        <OptionAction
          label={"longoptionname".repeat(6)}
          description="A description wraps while its trailing action stays aligned."
        />
        <InlineNotice
          actions={<Button>{"longrecoveryaction".repeat(4)}</Button>}
        >
          Connection unavailable
        </InlineNotice>
        <Select
          id="long-option"
          value="long"
          options={[{ value: "long", label: "longmodelname".repeat(12) }]}
          onValueChange={() => {}}
          aria-label="Long model name"
        />
        <ActionMenu
          label="Actions"
          icon={<CheckIcon />}
          items={[
            {
              id: "checked",
              kind: "checkbox",
              label: "Enabled option",
              checked: true,
              onSelect: () => {},
            },
            {
              id: "long-action",
              kind: "action",
              label: "longactionname".repeat(10),
              onSelect: () => {},
            },
          ]}
        />
        <HoverMenu
          label="More actions"
          icon={<CheckIcon />}
          items={[
            {
              id: "long-hover",
              label: "longactionname".repeat(10),
              description:
                "A long menu item remains readable inside the viewport.",
              onSelect: () => {},
            },
          ]}
        />
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
