// Project-owned controls: Base UI 1.8.0 public primitives; shadcn Base composition.

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { clsx } from "clsx";
import { type ComponentPropsWithRef, type ReactNode, useId } from "react";

export type SelectOption<T extends string> = { value: T; label: string };
export type SelectProps<T extends string> = {
  value: T;
  options: readonly SelectOption<T>[];
  onValueChange: (value: T) => void;
  id?: string | undefined;
  disabled?: boolean | undefined;
  "aria-label"?: string | undefined;
  "aria-describedby"?: string | undefined;
};
export function Select<T extends string>({
  value,
  options,
  onValueChange,
  id,
  disabled,
  ...aria
}: SelectProps<T>) {
  return (
    <SelectPrimitive.Root<T>
      value={value}
      items={options}
      disabled={disabled}
      id={id}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <SelectPrimitive.Trigger
        {...aria}
        className="ui-select"
        data-slot="select"
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className="ui-select-chevron">
          {null}
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={6}
          align="end"
          className="ui-select-positioner"
        >
          <SelectPrimitive.Popup className="ui-select-popup">
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="ui-select-option"
                >
                  <SelectPrimitive.ItemText>
                    {option.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="ui-select-indicator">
                    {null}
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
export type SwitchProps = Pick<
  ComponentPropsWithRef<"button">,
  "id" | "disabled" | "aria-label" | "aria-describedby"
> & { checked: boolean; onCheckedChange: (checked: boolean) => void };
export function Switch({ checked, onCheckedChange, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      {...props}
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value)}
      className="ui-switch"
      data-slot="switch"
    >
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
export type TextInputProps = ComponentPropsWithRef<"input">;
export function TextInput({ className, ...props }: TextInputProps) {
  return (
    <input
      {...props}
      data-slot="input"
      className={clsx("ui-input", className)}
    />
  );
}
export type FormFieldProps = {
  label: string;
  description?: ReactNode;
  error?: string | undefined;
  children: (control: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
};
export function FormField({
  label,
  description,
  error,
  children,
}: FormFieldProps) {
  const id = useId();
  const describedBy =
    [description ? `${id}-description` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="ui-form-field" data-slot="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy, invalid: !!error })}
      {description && (
        <p id={`${id}-description`} className="ui-field-description">
          {description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="failure">
          {error}
        </p>
      )}
    </div>
  );
}
// i18n-ignore: Generic type intersection, no rendered copy.
export type ChoiceOption<T extends string> = SelectOption<T> & {
  preview?: ReactNode;
};
export type ChoiceGroupProps<T extends string> = {
  value: T;
  options: readonly ChoiceOption<T>[];
  onValueChange: (value: T) => void;
  disabled?: boolean | undefined;
  "aria-label": string;
};
export function ChoiceGroup<T extends string>({
  options,
  onValueChange,
  ...props
}: ChoiceGroupProps<T>) {
  return (
    <RadioGroup
      {...props}
      onValueChange={(value) => onValueChange(value)}
      className="ui-choice-group"
      data-slot="choice-group"
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className="ui-choice-option"
        >
          <span className="ui-choice-control">
            {option.preview ?? <span>{option.label}</span>}
          </span>
          {option.preview && (
            <span className="ui-choice-label">{option.label}</span>
          )}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
