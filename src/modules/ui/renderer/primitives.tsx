import { clsx } from "clsx";
import type { ComponentPropsWithRef } from "react";

export type CheckboxProps = Omit<ComponentPropsWithRef<"input">, "type">;
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      {...props}
      type="checkbox"
      data-slot="checkbox"
      className={clsx("ui-checkbox", className)}
    />
  );
}
export type TextAreaProps = ComponentPropsWithRef<"textarea">;
export function TextArea({ className, ...props }: TextAreaProps) {
  return (
    <textarea
      {...props}
      data-slot="textarea"
      className={clsx("ui-input ui-textarea", className)}
    />
  );
}
export type SliderProps = Omit<ComponentPropsWithRef<"input">, "type">;
export function Slider({ className, ...props }: SliderProps) {
  return (
    <input
      {...props}
      type="range"
      data-slot="slider"
      className={clsx("ui-slider", className)}
    />
  );
}
export type DisclosureProps = ComponentPropsWithRef<"details">;
export function Disclosure({ className, ...props }: DisclosureProps) {
  return (
    <details
      {...props}
      data-slot="disclosure"
      className={clsx("ui-disclosure", className)}
    />
  );
}
export type DisclosureTriggerProps = ComponentPropsWithRef<"summary">;
export function DisclosureTrigger({
  className,
  ...props
}: DisclosureTriggerProps) {
  return (
    <summary
      {...props}
      data-slot="disclosure-trigger"
      className={clsx("ui-disclosure-trigger", className)}
    />
  );
}
