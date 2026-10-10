import { clsx } from "clsx";
import {
  type ComponentPropsWithRef,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { Button } from "./button";
import { ChevronDownIcon } from "./components/icons/common";

export type NavigationSectionProps = ComponentPropsWithRef<"section"> & {
  label: string;
  expanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  pending?: boolean;
  actions?: ReactNode;
  /** Mount on first expansion, then retain nodes on subsequent collapses. */
  deferMount?: boolean;
};

/** One heading/content contract for interactive sections and decorative placeholders. */
export function NavigationSection({
  label,
  expanded,
  onExpandedChange,
  pending = false,
  actions,
  deferMount = false,
  children,
  className,
  ...props
}: NavigationSectionProps) {
  const headingId = useId(),
    contentId = useId();
  const [visited, setVisited] = useState(expanded);
  useEffect(() => {
    if (expanded) setVisited(true);
  }, [expanded]);
  const heading = (
    <>
      {label}
      <span className="ui-navigation-chevron" data-expanded={expanded}>
        <ChevronDownIcon size={14} />
      </span>
    </>
  );
  return (
    <section
      {...props}
      className={clsx("ui-navigation-section", className)}
      data-slot="navigation-section"
      data-expanded={expanded}
      aria-labelledby={headingId}
    >
      <div
        className="ui-navigation-section-heading"
        data-slot="navigation-section-heading"
      >
        {onExpandedChange ? (
          <Button
            id={headingId}
            variant="navigation"
            appearance="plain"
            className="ui-navigation-section-label"
            aria-expanded={expanded}
            aria-controls={contentId}
            pending={pending}
            onClick={() => onExpandedChange(!expanded)}
          >
            {heading}
          </Button>
        ) : (
          <span id={headingId} className="ui-navigation-section-label">
            {heading}
          </span>
        )}
        {actions}
      </div>
      <div id={contentId} hidden={!expanded}>
        {(!deferMount || expanded || visited) && children}
      </div>
    </section>
  );
}

export type NavigationDisclosureProps = Omit<
  ComponentPropsWithRef<"button">,
  "children"
> & {
  label: string;
  expanded: boolean;
  count?: number | undefined;
  pending?: boolean;
};

/** A supporting text action, visibly distinct from a destination row. */
export function NavigationDisclosure({
  label,
  expanded,
  count,
  className,
  ...props
}: NavigationDisclosureProps) {
  return (
    <Button
      {...props}
      variant="navigation"
      appearance="plain"
      className={clsx("ui-navigation-disclosure", className)}
      aria-expanded={expanded}
      data-slot="navigation-disclosure"
    >
      <span className="ui-navigation-chevron" data-expanded={!expanded}>
        <ChevronDownIcon size={14} />
      </span>
      <span>{label}</span>
      {!expanded && count !== undefined && (
        <span className="ui-navigation-disclosure-count" aria-hidden="true">
          +{count}
        </span>
      )}
    </Button>
  );
}
