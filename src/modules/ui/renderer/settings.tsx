import { type ReactNode, useId } from "react";
export type SettingsPageProps = {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  hidden?: boolean;
};
export function SettingsPage({
  id,
  title,
  description,
  children,
  hidden,
}: SettingsPageProps) {
  return (
    <section
      id={id}
      hidden={hidden}
      className="ui-settings-page"
      aria-labelledby={`${id}-heading`}
    >
      <header className="ui-settings-page-header">
        <h2 id={`${id}-heading`}>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}
export type SettingsGroupProps = {
  title?: string;
  description?: string;
  children: ReactNode;
};
export function SettingsGroup({
  title,
  description,
  children,
}: SettingsGroupProps) {
  const id = useId();
  return (
    <section
      className="ui-settings-group"
      aria-labelledby={title ? id : undefined}
    >
      {title && (
        <header className="ui-settings-group-header">
          <h3 id={id}>{title}</h3>
          {description && <p>{description}</p>}
        </header>
      )}
      <div className="ui-settings-group-content">{children}</div>
    </section>
  );
}
export type SettingRowProps = {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
};
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: SettingRowProps) {
  return (
    <div className="ui-setting-row" data-slot="setting-row">
      <div className="ui-setting-copy">
        {htmlFor ? (
          <label htmlFor={htmlFor}>{label}</label>
        ) : (
          <div className="ui-setting-label">{label}</div>
        )}
        {description && (
          <div className="ui-setting-description">{description}</div>
        )}
      </div>
      <div className="ui-setting-control">{children}</div>
    </div>
  );
}
