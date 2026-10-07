import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChoiceGroup, Select } from "../../src/modules/ui/renderer/public";
import "../../src/app/renderer/styles/app.css";

const options = [
  { value: "standard", label: "Standard" },
  { value: "fast", label: "Fast" },
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
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
