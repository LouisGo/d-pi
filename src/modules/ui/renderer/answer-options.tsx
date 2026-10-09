import { type RadioOption, RadioOptions } from "./controls";
import { TextArea } from "./primitives";

export type AnswerSelection<T extends string> =
  | { kind: "option"; value: T }
  | { kind: "custom"; value: string }
  | null;

export type AnswerOptionsProps<T extends string> = {
  value: AnswerSelection<T>;
  options: readonly RadioOption<T>[];
  onValueChange: (value: Exclude<AnswerSelection<T>, null>) => void;
  disabled?: boolean;
  "aria-label": string;
  custom?: { label: string; placeholder?: string; maxLength?: number };
};

// A single controlled answer: choosing and writing are mutually exclusive.
// The caller owns submission and whether free-text answers are available.
export function AnswerOptions<T extends string>({
  value,
  options,
  onValueChange,
  disabled,
  custom,
  "aria-label": label,
}: AnswerOptionsProps<T>) {
  return (
    <div className="ui-answer-options" data-slot="answer-options">
      <RadioOptions
        aria-label={label}
        options={options}
        value={value?.kind === "option" ? value.value : null}
        disabled={disabled}
        onValueChange={(next) => onValueChange({ kind: "option", value: next })}
      />
      {custom && (
        <TextArea
          variant="quiet"
          rows={1}
          aria-label={custom.label}
          placeholder={custom.placeholder}
          maxLength={custom.maxLength}
          disabled={disabled}
          value={value?.kind === "custom" ? value.value : ""}
          onChange={(event) =>
            onValueChange({ kind: "custom", value: event.target.value })
          }
        />
      )}
    </div>
  );
}
