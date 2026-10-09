import { useId } from "react";
import { Button, type ButtonProps } from "./button";
import { ChevronRightIcon } from "./components/icons/common";

export type OptionActionProps = Omit<
  ButtonProps,
  "children" | "variant" | "size"
> & {
  label: string;
  description?: string | undefined;
};

// An immediate choice action, not a radio option or a second selection store.
export function OptionAction({
  label,
  description,
  ...props
}: OptionActionProps) {
  const id = useId();
  return (
    <Button
      {...props}
      variant="option"
      aria-labelledby={`${id}-label`}
      aria-describedby={
        [description ? `${id}-description` : null, props["aria-describedby"]]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <span className="ui-option-action-copy">
        <span id={`${id}-label`} className="ui-option-action-label">
          {label}
        </span>
        {description && (
          <span
            id={`${id}-description`}
            className="ui-option-action-description"
          >
            {description}
          </span>
        )}
      </span>
      <ChevronRightIcon className="ui-option-action-chevron" />
    </Button>
  );
}
