/** Keeps the filename end visible; the full path remains the accessible text. */
export function PathLabel({ path }: { path: string }) {
  return (
    <span className="ui-path-label" dir="rtl" title={path}>
      <bdi>{path}</bdi>
    </span>
  );
}
