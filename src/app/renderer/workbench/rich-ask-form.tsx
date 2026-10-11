import type {
  AskFormAction,
  AskInteractionDraft,
  Interaction,
} from "../../../modules/execution/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  ActionGroup,
  Button,
  Checkbox,
  RadioOptions,
  TextArea,
} from "../../../modules/ui/renderer/public";
import { Markdown } from "../reading/markdown";

/** Controlled presentation; the Thread's RuntimeModel owns all form progress. */
export function RichAskForm({
  item,
  draft,
  disabled,
  complete,
  edit,
  submit,
}: {
  item: Extract<Interaction, { method: "ask" }>;
  draft: AskInteractionDraft;
  disabled: boolean;
  complete: boolean;
  edit: (action: AskFormAction) => void;
  submit: () => void;
}) {
  const { t } = useI18n();
  const index = item.questions.findIndex((q) => q.id === draft.questionId);
  const question = item.questions[index];
  const answer = question && draft.answers[question.id];
  if (!question || !answer) return null;
  const preview =
    draft.preview?.questionId === question.id
      ? question.options.find((o) => o.label === draft.preview?.label)
      : undefined;
  const description = (option: (typeof question.options)[number]) =>
    [
      option.description,
      question.recommended !== undefined &&
      question.options[question.recommended]?.label === option.label
        ? t("ui.interaction.recommended")
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <div className="rich-ask-form" data-interaction-editor>
      <p className="muted">
        {t("ui.interaction.questionProgress", {
          current: index + 1,
          total: item.questions.length,
        })}
      </p>
      {draft.reviewing ? (
        <div className="rich-ask-review">
          {item.questions.map((q) => {
            const value = draft.answers[q.id];
            return (
              <section key={q.id}>
                <strong>{q.question}</strong>
                <p data-selectable>
                  {value?.selectedOptions.join("、") ||
                    (value?.explicitNone ? t("ui.interaction.selectNone") : "")}
                </p>
                {value?.custom && <p data-selectable>{value.customInput}</p>}
                {!value?.selectedOptions.length &&
                  !value?.explicitNone &&
                  !(value?.custom && value.customInput.trim()) && (
                    <p>{t("ui.interaction.unanswered")}</p>
                  )}
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => edit({ kind: "question", questionId: q.id })}
                >
                  {t("ui.interaction.editQuestion", { question: q.question })}
                </Button>
              </section>
            );
          })}
        </div>
      ) : (
        <fieldset className="rich-ask-question" disabled={disabled}>
          <legend>{question.question}</legend>
          {question.multi ? (
            question.options.map((option) => (
              <label className="rich-ask-option" key={option.label}>
                <Checkbox
                  aria-label={option.label}
                  checked={answer.selectedOptions.includes(option.label)}
                  onChange={() =>
                    edit({
                      kind: "select",
                      questionId: question.id,
                      label: option.label,
                    })
                  }
                />
                <span>
                  <span>{option.label}</span>
                  {description(option) && (
                    <span className="muted">{description(option)}</span>
                  )}
                </span>
              </label>
            ))
          ) : (
            <RadioOptions
              aria-label={question.question}
              value={answer.custom ? null : (answer.selectedOptions[0] ?? null)}
              options={question.options.map((option) => ({
                value: option.label,
                label: option.label,
                description: description(option),
              }))}
              disabled={disabled}
              onValueChange={(label) =>
                edit({ kind: "select", questionId: question.id, label })
              }
            />
          )}
          <ActionGroup>
            {question.multi && (
              <Button
                variant="subtle"
                disabled={disabled}
                aria-pressed={answer.explicitNone}
                onClick={() => edit({ kind: "none", questionId: question.id })}
              >
                {t("ui.interaction.selectNone")}
              </Button>
            )}
            <Button
              variant="subtle"
              disabled={disabled}
              aria-pressed={answer.custom}
              onClick={() =>
                edit({
                  kind: "custom-mode",
                  questionId: question.id,
                  value: !answer.custom,
                })
              }
            >
              {t("ui.interaction.customAnswer")}
            </Button>
          </ActionGroup>
          {answer.custom && (
            <TextArea
              data-native-answer
              aria-label={t("ui.interaction.customAnswer")}
              disabled={disabled}
              value={answer.customInput}
              maxLength={16384}
              placeholder={t("ui.interaction.customPlaceholder")}
              onChange={(event) =>
                edit({
                  kind: "custom",
                  questionId: question.id,
                  value: event.target.value,
                })
              }
            />
          )}
          {question.options.some((option) => option.preview) && (
            <ActionGroup>
              {question.options
                .filter((option) => option.preview)
                .map((option) => (
                  <Button
                    key={option.label}
                    variant="ghost"
                    disabled={disabled}
                    aria-expanded={preview?.label === option.label}
                    onClick={() =>
                      edit({
                        kind: "preview",
                        questionId: question.id,
                        label: option.label,
                      })
                    }
                  >
                    {t("ui.interaction.previewOption", {
                      option: option.label,
                    })}
                  </Button>
                ))}
            </ActionGroup>
          )}
          {preview?.preview && (
            <div className="rich-ask-preview" data-selectable>
              <Markdown text={preview.preview} />
            </div>
          )}
        </fieldset>
      )}
      <footer className="native-interaction-footer">
        <ActionGroup>
          {!draft.reviewing && (
            <>
              <Button
                variant="subtle"
                disabled={disabled || index <= 0}
                onClick={() =>
                  edit({
                    kind: "question",
                    questionId: item.questions[index - 1]!.id,
                  })
                }
              >
                {t("ui.interaction.previousQuestion")}
              </Button>
              {index + 1 < item.questions.length && (
                <Button
                  disabled={disabled}
                  onClick={() =>
                    edit({
                      kind: "question",
                      questionId: item.questions[index + 1]!.id,
                    })
                  }
                >
                  {t("ui.interaction.nextQuestion")}
                </Button>
              )}
              <Button
                variant="accent"
                disabled={disabled}
                onClick={() => edit({ kind: "review", value: true })}
              >
                {t("ui.interaction.reviewAnswers")}
              </Button>
            </>
          )}
          {draft.reviewing && (
            <Button
              variant="accent"
              disabled={disabled || !complete}
              onClick={submit}
            >
              {t("ui.interaction.submit")}
            </Button>
          )}
        </ActionGroup>
      </footer>
    </div>
  );
}
