// Project-owned controls: Base UI 1.8.0 public primitives; shadcn Base composition.

import { Combobox } from "@base-ui/react/combobox";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { clsx } from "clsx";
import {
  type ComponentPropsWithRef,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

import {
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
} from "./components/icons/common";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
  searchText?: string;
};
export type SelectProps<T extends string> = {
  value: T;
  search?: { label: string; empty: string };
  options: readonly SelectOption<T>[];
  onValueChange: (value: T) => void;
  id?: string | undefined;
  name?: string | undefined;
  disabled?: boolean | undefined;
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: ComponentPropsWithRef<"button">["aria-invalid"];
  ref?: ComponentPropsWithRef<"button">["ref"];
};
export function Select<T extends string>({
  value,
  options,
  onValueChange,
  id,
  name,
  disabled,
  search,
  ref,
  ...aria
}: SelectProps<T>) {
  if (search)
    return (
      <SearchSelect
        value={value}
        options={options}
        onValueChange={onValueChange}
        id={id}
        name={name}
        disabled={disabled}
        search={search}
        ref={ref}
        {...aria}
      />
    );
  return (
    <SelectPrimitive.Root<T>
      value={value}
      items={options}
      disabled={disabled}
      id={id}
      name={name}
      onValueChange={(next, details) => {
        // Metadata may invalidate a controlled value. Require an explicit choice;
        // hidden-input reconciliation must not silently replace that intention.
        if (
          details.reason === "none" &&
          !options.some((option) => option.value === value)
        ) {
          details.cancel();
          return;
        }
        if (next !== null) onValueChange(next);
      }}
    >
      <SelectPrimitive.Trigger
        {...aria}
        ref={ref}
        title={options.find((option) => option.value === value)?.label ?? value}
        name={name}
        value={value}
        className="ui-select"
        data-slot="select"
      >
        <SelectPrimitive.Value className="ui-select-value" />
        <SelectPrimitive.Icon className="ui-select-chevron">
          <ChevronDownIcon />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          side="bottom"
          alignItemWithTrigger={false}
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
                  data-value={option.value}
                  disabled={option.disabled}
                  className="ui-select-option"
                >
                  <SelectPrimitive.ItemText className="ui-select-option-text">
                    {option.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator
                    keepMounted
                    className="ui-select-indicator"
                  >
                    <CheckIcon />
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
// i18n-ignore: Generic type, no rendered copy.
export type ChoiceOption<T extends string> = SelectOption<T>;
export type ChoiceGroupProps<T extends string> = {
  value: T;
  // i18n-ignore: At least two exclusive choices, no rendered copy.
  options: readonly [ChoiceOption<T>, ChoiceOption<T>, ...ChoiceOption<T>[]];
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
          disabled={option.disabled}
          className="ui-choice-option"
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

// i18n-ignore: Caller-supplied text type, no rendered copy.
export type RadioOption<T extends string> = SelectOption<T> & {
  description?: string | undefined;
};
export type RadioOptionsProps<T extends string> = {
  value: T | null;
  options: readonly RadioOption<T>[];
  onValueChange: (value: T) => void;
  disabled?: boolean | undefined;
  "aria-label": string;
};

// A question's choices are a vertical radio list, separate from segmented modes.
export function RadioOptions<T extends string>({
  options,
  onValueChange,
  ...props
}: RadioOptionsProps<T>) {
  return (
    <RadioGroup
      {...props}
      onValueChange={(value) => {
        if (value !== null) onValueChange(value);
      }}
      className="ui-radio-options"
      data-slot="radio-options"
    >
      {options.map((option) => (
        <RadioOptionItem key={option.value} option={option} />
      ))}
    </RadioGroup>
  );
}

function RadioOptionItem<T extends string>({
  option,
}: {
  option: RadioOption<T>;
}) {
  const descriptionId = useId();
  return (
    <Radio.Root
      value={option.value}
      aria-label={option.label}
      aria-describedby={option.description ? descriptionId : undefined}
      disabled={option.disabled}
      className="ui-radio-option"
    >
      <span className="ui-radio-circle" aria-hidden="true">
        <Radio.Indicator className="ui-radio-dot" />
      </span>
      <span className="ui-radio-copy">
        <span>{option.label}</span>
        {option.description && (
          <span id={descriptionId} className="ui-radio-description">
            {option.description}
          </span>
        )}
      </span>
    </Radio.Root>
  );
}

function SearchSelect<T extends string>({
  value,
  options,
  onValueChange,
  id,
  name,
  disabled,
  search,
  ref,
  ...aria
}: SelectProps<T> & { search: { label: string; empty: string } }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const filtered = options.filter((option) =>
    `${option.label} ${option.searchText ?? ""}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase().trim()),
  );
  return (
    <Combobox.Root<SelectOption<T>>
      name={name}
      items={filtered}
      filter={null}
      value={selected}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={() => setQuery("")}
      onValueChange={(next) => {
        if (next && !next.disabled) onValueChange(next.value);
      }}
      isItemEqualToValue={(a, b) => a.value === b.value}
      disabled={disabled}
    >
      <Combobox.Trigger
        {...aria}
        ref={ref}
        id={id}
        name={name}
        value={value}
        className="ui-select"
        data-slot="select"
        title={selected?.label ?? value}
      >
        <span className="ui-select-value">{selected?.label ?? value}</span>
        <Combobox.Icon className="ui-select-chevron">
          <ChevronDownIcon />
        </Combobox.Icon>
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className="ui-select-positioner"
        >
          <Combobox.Popup
            className="ui-select-popup ui-search-select-popup"
            initialFocus={input}
          >
            <div className="ui-select-search-bar">
              <SearchIcon className="ui-select-search-icon" />
              <Combobox.Input
                ref={input}
                className="ui-input ui-select-search"
                aria-label={search.label}
                placeholder={search.label}
              />
            </div>
            <Combobox.Empty className="ui-select-empty">
              {search.empty}
            </Combobox.Empty>
            <Combobox.List className="ui-select-list">
              {(option: SelectOption<T>) => (
                <Combobox.Item
                  key={option.value}
                  value={option}
                  data-value={option.value}
                  disabled={option.disabled}
                  className="ui-select-option"
                >
                  <span className="ui-select-option-text">{option.label}</span>
                  <Combobox.ItemIndicator
                    keepMounted
                    className="ui-select-indicator"
                  >
                    <CheckIcon />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
