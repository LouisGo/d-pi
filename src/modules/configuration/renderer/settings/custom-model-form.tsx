import { useState } from "react";
import { useI18n } from "../../../preferences/renderer/public";
import {
  Button,
  FormField,
  SettingRow,
  Switch,
  TextInput,
} from "../../../ui/renderer/public";
import {
  type ConfigurationScope,
  type ConfigurationSnapshot,
  CustomModelInputSchema,
} from "../../contracts/public";
import type { useConfigurationWrite } from "./use-configuration-write";

type Model = ConfigurationSnapshot["models"][number];

export function CustomModelForm({
  provider,
  model,
  snapshot,
  scope,
  disabled,
  write,
  onClose,
}: {
  provider: string;
  model?: Model | undefined;
  snapshot: ConfigurationSnapshot;
  scope: ConfigurationScope;
  disabled: boolean;
  write: ReturnType<typeof useConfigurationWrite>;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [editRevision] = useState(snapshot.revision);
  const [providerId, setProvider] = useState(model?.provider ?? provider);
  const [id, setId] = useState(model?.id ?? "");
  const [name, setName] = useState(model?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(
    model?.baseUrl ??
      snapshot.providers?.find((entry) => entry.id === provider)?.baseUrl ??
      "",
  );
  const [api, setApi] = useState(model?.api ?? "");
  const [contextWindow, setContext] = useState(
    String(model?.contextWindow ?? 128000),
  );
  const [maxTokens, setMaxTokens] = useState(String(model?.maxTokens ?? 16000));
  const [reasoning, setReasoning] = useState(model?.reasoning ?? false);
  const [image, setImage] = useState(model?.input.includes("image") ?? false);
  const [invalid, setInvalid] = useState(false);
  const fields = [
    {
      label: t("models.providerId"),
      name: "model-provider",
      value: providerId,
      set: setProvider,
      readOnly: !!model,
    },
    {
      label: t("models.modelId"),
      name: "model-id",
      value: id,
      set: setId,
      readOnly: !!model,
    },
    { label: t("models.name"), name: "model-name", value: name, set: setName },
    {
      label: t("models.baseUrl"),
      name: "model-base-url",
      value: baseUrl,
      set: setBaseUrl,
    },
    {
      label: t("models.api"),
      name: "model-api",
      value: api,
      set: setApi,
      placeholder: t("models.apiDefault"),
    },
    {
      label: t("models.contextWindow"),
      name: "model-context",
      value: contextWindow,
      set: setContext,
      type: "number",
    },
    {
      label: t("models.maxTokens"),
      name: "model-max-tokens",
      value: maxTokens,
      set: setMaxTokens,
      type: "number",
    },
  ];
  return (
    <form
      className="providers-custom-form providers-detail-section"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || !editRevision) return;
        const result = CustomModelInputSchema.safeParse({
          provider: providerId,
          id,
          name,
          baseUrl,
          ...(api.trim() ? { api } : {}),
          contextWindow: Number(contextWindow),
          maxTokens: Number(maxTokens),
          reasoning,
          input: image ? ["text", "image"] : ["text"],
          ...(model?.cost ? { cost: model.cost } : {}),
        });
        if (
          !result.success ||
          (!snapshot.providers?.some(
            (entry) => entry.id === providerId.trim(),
          ) &&
            !api.trim())
        ) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        if (
          await write.request({
            kind: "upsert-custom-model",
            scope,
            model: result.data,
            expectedRevision: editRevision,
            traceId: crypto.randomUUID(),
          })
        )
          onClose();
      }}
    >
      <div>
        <h4>
          {model
            ? t("models.editCustom", { name: model.name })
            : t("models.addCustom")}
        </h4>
        <p className="providers-hint">{t("models.customDescription")}</p>
      </div>
      <div className="providers-custom-fields">
        {fields.map((field) => (
          <FormField label={field.label} key={field.name}>
            {({ id: fieldId, describedBy }) => (
              <TextInput
                id={fieldId}
                name={field.name}
                aria-describedby={describedBy}
                value={field.value}
                onChange={(event) => field.set(event.target.value)}
                readOnly={field.readOnly}
                disabled={disabled}
                type={field.type ?? "text"}
                min={field.type === "number" ? 1 : undefined}
                step={field.type === "number" ? 1 : undefined}
                placeholder={field.placeholder}
                autoComplete="off"
                spellCheck={false}
                required={
                  field.name !== "model-api" ||
                  !snapshot.providers?.some(
                    (provider) => provider.id === providerId.trim(),
                  )
                }
              />
            )}
          </FormField>
        ))}
      </div>
      <SettingRow label={t("models.reasoning")}>
        <Switch
          checked={reasoning}
          disabled={disabled}
          aria-label={t("models.reasoning")}
          onCheckedChange={setReasoning}
        />
      </SettingRow>
      <SettingRow label={t("models.vision")}>
        <Switch
          checked={image}
          disabled={disabled}
          aria-label={t("models.vision")}
          onCheckedChange={setImage}
        />
      </SettingRow>
      {snapshot.revision !== editRevision && (
        <p role="status" className="providers-hint">
          {t("models.editChanged")}
        </p>
      )}
      {invalid && (
        <p className="failure" role="alert">
          {t("models.customInvalid")}
        </p>
      )}
      <p className="providers-hint">{t("models.customNewProvider")}</p>
      <div className="providers-form-actions">
        <Button type="submit" disabled={disabled || !editRevision}>
          {t("models.save")}
        </Button>
        <Button variant="ghost" disabled={disabled} onClick={onClose}>
          {t("providers.cancel")}
        </Button>
      </div>
    </form>
  );
}
