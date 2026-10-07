import { type ComponentType, type ReactNode, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  type ComponentName,
  categories,
  componentCatalog,
  copy,
  menuEntry,
} from "./catalog";
import styles from "./component-dashboard.module.css";
import {
  ButtonDemo,
  IconButtonDemo,
  IconsDemo,
  NavigationDemo,
  SettingsDemo,
  SplitDemo,
  TabsDemo,
} from "./demos";

const demos: Record<ComponentName, ComponentType> = {
  Button: ButtonDemo,
  IconButton: IconButtonDemo,
  WorkspaceTabs: TabsDemo,
  ResizableSplit: SplitDemo,
  NavigationOverlay: NavigationDemo,
  SettingsModal: SettingsDemo,
  "Icon Layer": IconsDemo,
};
function ComponentPreview({
  entry,
  children,
}: {
  entry: { name: string; purpose: string; forms: string };
  children: ReactNode;
}) {
  const [revision, setRevision] = useState(0);
  return (
    <section
      className={styles["gallery-component"]}
      data-component={entry.name}
      aria-labelledby={`gallery-title-${entry.name.replaceAll(" ", "-")}`}
    >
      <div className={styles["gallery-component-heading"]}>
        <div>
          <h3 id={`gallery-title-${entry.name.replaceAll(" ", "-")}`}>
            {entry.name}
          </h3>
          <p>{entry.purpose}</p>
        </div>
        <Button
          variant="ghost"
          aria-label={copy.resetLabel(entry.name)}
          onClick={() => setRevision(revision + 1)}
        >
          {copy.reset}
        </Button>
      </div>
      <p className={styles["gallery-forms"]} data-selectable>
        {entry.forms}
      </p>
      <div className={styles["gallery-preview"]} key={revision}>
        {children}
      </div>
    </section>
  );
}
export function ComponentDashboard({
  additionalPreview,
}: {
  additionalPreview?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const matches = (entry: {
    name: string;
    purpose: string;
    forms: string;
    category: string;
  }) =>
    [
      entry.name,
      entry.purpose,
      entry.forms,
      categories.find((category) => category.id === entry.category)?.label ??
        "",
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle);
  const visible = componentCatalog.filter(matches);
  const menuVisible = Boolean(additionalPreview) && matches(menuEntry);
  const total = componentCatalog.length + (additionalPreview ? 1 : 0);
  const count = visible.length + (menuVisible ? 1 : 0);
  const visibleCategories = categories.filter(
    (category) =>
      visible.some((entry) => entry.category === category.id) ||
      (category.id === "overlays" && menuVisible),
  );
  return (
    <div className={styles["component-dashboard"]} data-component-dashboard>
      <header className={styles["gallery-header"]}>
        <div className={styles["gallery-title-row"]} data-gallery-title>
          <h1>{copy.title}</h1>
          <span className={styles["gallery-label"]} aria-live="polite">
            {copy.count(count, total)}
          </span>
        </div>
        <p>{copy.intro}</p>
        <label className={styles["gallery-search"]}>
          <span>{copy.search}</span>
          <input
            type="search"
            aria-label={copy.search}
            placeholder={copy.searchHint}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <nav className={styles["gallery-index"]} aria-label={copy.title}>
          {visibleCategories.map((category) => (
            <a key={category.id} href={`#gallery-${category.id}`}>
              {category.label}
            </a>
          ))}
        </nav>
      </header>
      <div className={styles["gallery-content"]}>
        {count === 0 && (
          <div className={styles["gallery-empty"]} role="status">
            <h2>{copy.empty}</h2>
            <p>{copy.emptyHint}</p>
            <Button variant="ghost" onClick={() => setQuery("")}>
              {copy.clear}
            </Button>
          </div>
        )}
        {visibleCategories.map((category) => (
          <section
            key={category.id}
            className={styles["gallery-category"]}
            id={`gallery-${category.id}`}
            aria-labelledby={`gallery-category-${category.id}`}
          >
            <h2 id={`gallery-category-${category.id}`}>{category.label}</h2>
            {visible
              .filter((entry) => entry.category === category.id)
              .map((entry) => {
                const Demo = demos[entry.name];
                return (
                  <ComponentPreview key={entry.name} entry={entry}>
                    <Demo />
                  </ComponentPreview>
                );
              })}
            {category.id === "overlays" && menuVisible && (
              <ComponentPreview entry={menuEntry}>
                {additionalPreview}
              </ComponentPreview>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
