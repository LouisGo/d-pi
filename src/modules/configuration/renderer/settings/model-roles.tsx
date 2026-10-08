import { useState } from "react";
import { useI18n } from "../../../preferences/renderer/public";
import { ChoiceGroup, Select } from "../../../ui/renderer/public";
import type {
  ConfigurationScope,
  ConfigurationSnapshot,
} from "../../contracts/public";
import type { useConfigurationWrite } from "./use-configuration-write";

export function ModelRoles({
  snapshot,
  scope,
  disabled,
  write,
}: {
  snapshot: ConfigurationSnapshot;
  scope: ConfigurationScope;
  disabled: boolean;
  write: ReturnType<typeof useConfigurationWrite>;
}) {
  const { t } = useI18n();
  const [target, setTarget] = useState<"global" | "project">(
    scope.kind === "thread" ? "project" : "global",
  );
  return (
    <section className="providers-detail-section providers-model-roles">
      <div>
        <h4>{t("models.role")}</h4>
        <p className="providers-hint">{t("models.roleDescription")}</p>
      </div>
      <ChoiceGroup
        aria-label={t("models.roleTarget")}
        value={target}
        disabled={disabled}
        options={[
          { value: "global", label: t("models.roleGlobal") },
          {
            value: "project",
            label: t("models.roleProject"),
            disabled: scope.kind !== "thread",
          },
        ]}
        onValueChange={setTarget}
      />
      <div className="providers-role-list">
        {snapshot.modelRoles?.map((role) => {
          const value =
            (target === "project" ? role.projectValue : role.globalValue) ?? "";
          const eligible = snapshot.models.filter(
            (model) =>
              model.available && model.assignableRoles?.includes(role.role),
          );
          const options = [
            { value: "", label: t("models.inherit") },
            ...eligible.map((model) => ({
              value: `${model.provider}/${model.id}`,
              label: `${model.name} · ${model.provider}`,
              searchText: model.id,
            })),
          ];
          if (value && !options.some((option) => option.value === value))
            options.push({
              value,
              label: t("models.nativeValue", { value }),
              searchText: value,
            });
          return (
            <div
              className="providers-role-row"
              key={role.role}
              data-model-role={role.role}
            >
              <div>
                <p>{role.name}</p>
                <p className="providers-hint">
                  {role.value
                    ? t("models.nativeValue", { value: role.value })
                    : !eligible.length
                      ? t("models.roleUnavailable")
                      : t("models.inherit")}
                </p>
              </div>
              <Select
                aria-label={role.name}
                search={{
                  label: t("models.search"),
                  empty: t("models.noResults"),
                }}
                value={value}
                options={options.map((option) => ({
                  ...option,
                  disabled:
                    option.value !== "" &&
                    !eligible.some(
                      (model) =>
                        `${model.provider}/${model.id}` === option.value,
                    ),
                }))}
                disabled={disabled || !snapshot.revision}
                onValueChange={(selector) => {
                  if (!snapshot.revision) return;
                  void write.request({
                    kind: "set-model-role",
                    scope,
                    role: role.role,
                    target,
                    selector: selector || null,
                    expectedRevision: snapshot.revision,
                    traceId: crypto.randomUUID(),
                  });
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
