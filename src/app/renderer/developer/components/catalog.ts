import { useMemo } from "react";
import { useI18n } from "../../../../modules/preferences/renderer/public";

export function useComponentDashboardCopy() {
  const { t } = useI18n();
  return useMemo(() => {
    const categories = [
      { id: "actions", label: t("dev.categories.actions.label") },
      { id: "forms", label: t("dev.categories.forms.label") },
      { id: "layout", label: t("dev.categories.layout.label") },
      { id: "overlays", label: t("dev.categories.overlays.label") },
      { id: "business", label: t("dev.categories.business.label") },
      { id: "icons", label: t("dev.categories.icons.label") },
    ] as const;
    const componentCatalog = [
      {
        name: "ComposerTag",
        category: "business",
        purpose: t("dev.componentCatalog.ComposerTag.purpose"),
        forms:
          "label · leading · detail / middle truncation · Tooltip / editor · message",
      },
      {
        name: "Checkbox",
        category: "forms",
        purpose: t("dev.componentCatalog.Checkbox.purpose"),
        forms: "checked · unchecked · disabled",
      },
      {
        name: "TextInput",
        category: "forms",
        purpose: t("dev.componentCatalog.TextInput.purpose"),
        forms: "text · number · readOnly · disabled",
      },
      {
        name: "TextArea",
        category: "forms",
        purpose: t("dev.componentCatalog.TextArea.purpose"),
        forms: "editable · readOnly · disabled",
      },
      {
        name: "Slider",
        category: "forms",
        purpose: t("dev.componentCatalog.Slider.purpose"),
        forms: "range · step · disabled",
      },
      {
        name: "Disclosure",
        category: "layout",
        purpose: t("dev.componentCatalog.Disclosure.purpose"),
        forms: "open · closed · keyboard",
      },
      {
        name: "Modal",
        category: "overlays",
        purpose: t("dev.componentCatalog.Modal.purpose"),
        forms: "open · closed · Esc · returnFocus",
      },
      {
        name: "StatusPreview",
        category: "overlays",
        purpose: t("dev.componentCatalog.StatusPreview.purpose"),
        forms: "summary · popover · keyboard",
      },
      {
        name: "Tooltip",
        category: "overlays",
        purpose: t("dev.componentCatalog.Tooltip.purpose"),
        forms: "hover · focus · Esc",
      },
      {
        name: "HoverCard",
        category: "overlays",
        purpose: t("dev.componentCatalog.HoverCard.purpose"),
        forms: "hover · focus · scroll · Esc",
      },
      {
        name: "Select",
        category: "forms",
        purpose: t("dev.componentCatalog.Select.purpose"),
        forms: t("dev.componentCatalog.Select.forms"),
      },
      {
        name: "Switch",
        category: "forms",
        purpose: t("dev.componentCatalog.Switch.purpose"),
        forms: "checked · unchecked / disabled",
      },
      {
        name: "FormField",
        category: "forms",
        purpose: t("dev.componentCatalog.FormField.purpose"),
        forms: "text · password / disabled · invalid / description",
      },
      {
        name: "ChoiceGroup",
        category: "forms",
        purpose: t("dev.componentCatalog.ChoiceGroup.purpose"),
        forms: "selected · unselected / disabled / radio keyboard",
      },
      {
        name: "SettingsGroup",
        category: "forms",
        purpose: t("dev.componentCatalog.SettingsGroup.purpose"),
        forms:
          "SettingsPage · SettingsGroup · SettingRow / label · description · control",
      },
      {
        name: "Button",
        category: "actions",
        purpose: t("dev.componentCatalog.Button.purpose"),
        forms:
          "default · secondary · ghost · navigation / default · icon / disabled · pressed",
      },
      {
        name: "IconButton",
        category: "actions",
        purpose: t("dev.componentCatalog.IconButton.purpose"),
        forms: t("dev.componentCatalog.IconButton.forms"),
      },
      {
        name: "TabStrip",
        category: "layout",
        purpose: t("dev.componentCatalog.TabStrip.purpose"),
        forms: t("dev.componentCatalog.TabStrip.forms"),
      },
      {
        name: "ResizableSplit",
        category: "layout",
        purpose: t("dev.componentCatalog.ResizableSplit.purpose"),
        forms: "horizontal · vertical / start · end / visible · hidden",
      },
      {
        name: "NavigationOverlay",
        category: "overlays",
        purpose: t("dev.componentCatalog.NavigationOverlay.purpose"),
        forms: t("dev.componentCatalog.NavigationOverlay.forms"),
      },
      {
        name: "SettingsModal",
        category: "overlays",
        purpose: t("dev.componentCatalog.SettingsModal.purpose"),
        forms: t("dev.componentCatalog.SettingsModal.forms"),
      },
      {
        name: "Icon Layer",
        category: "icons",
        purpose: t("dev.componentCatalog.IconLayer.purpose"),
        forms: t("dev.componentCatalog.IconLayer.forms"),
      },
      {
        name: "Badge",
        category: "actions",
        purpose: t("dev.componentCatalog.Badge.purpose"),
        forms: "neutral · emphasis · danger / long text",
      },
      {
        name: "ActionGroup",
        category: "actions",
        purpose: t("dev.componentCatalog.ActionGroup.purpose"),
        forms: "start · end / wrapping",
      },
      {
        name: "OptionAction",
        category: "actions",
        purpose: t("dev.componentCatalog.OptionAction.purpose"),
        forms: "label · description / wrapping · disabled · keyboard",
      },
      {
        name: "InlineNotice",
        category: "actions",
        purpose: t("dev.componentCatalog.InlineNotice.purpose"),
        forms: "neutral · danger / optional actions",
      },
      {
        name: "EmptyState",
        category: "layout",
        purpose: t("dev.componentCatalog.EmptyState.purpose"),
        forms: "page · compact / description · action · note",
      },
      {
        name: "Kbd",
        category: "layout",
        purpose: t("dev.componentCatalog.Kbd.purpose"),
        forms: "single key · chord",
      },
      {
        name: "CopyButton",
        category: "actions",
        purpose: t("dev.componentCatalog.CopyButton.purpose"),
        forms: "idle · pending · copied · failed",
      },
      {
        name: "PathLabel",
        category: "layout",
        purpose: t("dev.componentCatalog.PathLabel.purpose"),
        forms: "short · long / tail ellipsis",
      },
      {
        name: "MessageHeader",
        category: "business",
        purpose: t("dev.componentCatalog.MessageHeader.purpose"),
        forms: "title · status · actions / wrapping",
      },
      {
        name: "ConversationMessage",
        category: "business",
        purpose: t("dev.componentCatalog.ConversationMessage.purpose"),
        forms: "user · assistant / thinking · streaming · hover · keyboard",
      },
      {
        name: "ToolResultFrame",
        category: "business",
        purpose: t("dev.componentCatalog.ToolResultFrame.purpose"),
        forms: "open · closed / long output",
      },
      {
        name: "NativeInteraction",
        category: "business",
        purpose: t("dev.componentCatalog.NativeInteraction.purpose"),
        forms: "pending · custom answer · answered / local demo",
      },
    ] as const;
    const menuEntry = {
      name: "HoverMenu",
      category: "overlays",
      purpose: t("dev.menuEntry.purpose"),
      forms: t("dev.menuEntry.forms"),
    };
    const copy = {
      title: t("dev.copy.title"),
      intro: t("dev.copy.intro"),
      search: t("dev.copy.search"),
      index: t("dev.copy.index"),
      searchHint: t("dev.copy.searchHint"),
      all: t("dev.copy.all"),
      empty: t("dev.copy.empty"),
      emptyHint: t("dev.copy.emptyHint"),
      clear: t("dev.copy.clear"),
      reset: t("dev.copy.reset"),
      resetLabel: (name: string) => t("dev.copy.resetLabel", { name }),
      count: (visible: number, total: number) =>
        t("dev.copy.count", { visible, total }),
    };
    return { categories, componentCatalog, menuEntry, copy };
  }, [t]);
}
export type ComponentName = ReturnType<
  typeof useComponentDashboardCopy
>["componentCatalog"][number]["name"];

export function useDemoLabels() {
  const { t } = useI18n();
  return useMemo(
    () => ({
      choiceDrive: "Drive",
      choiceDots: "Dots",
      choiceOrbit: "Orbit",
      choiceSurfer: "Surfer",
      select: t("dev.demoLabels.select"),
      optionC: t("dev.demoLabels.optionC"),
      searchableSelect: t("dev.demoLabels.searchableSelect"),
      searchOptions: t("dev.demoLabels.searchOptions"),
      noOptions: t("dev.demoLabels.noOptions"),
      optionA: t("dev.demoLabels.optionA"),
      optionB: t("dev.demoLabels.optionB"),
      switch: t("dev.demoLabels.switch"),
      field: t("dev.demoLabels.field"),
      fieldDescription: t("dev.demoLabels.fieldDescription"),
      fieldError: t("dev.demoLabels.fieldError"),
      mode: t("dev.demoLabels.mode"),
      settingsPageTitle: t("dev.demoLabels.settingsPageTitle"),
      settingsDescription: t("dev.demoLabels.settingsDescription"),
      settingsGroup: t("dev.demoLabels.settingsGroup"),
      settingsRow: t("dev.demoLabels.settingsRow"),
      settingsRowDescription: t("dev.demoLabels.settingsRowDescription"),
      accent: t("dev.demoLabels.accent"),
      destructive: t("dev.demoLabels.destructive"),
      primary: t("dev.demoLabels.primary"),
      ghost: t("dev.demoLabels.ghost"),
      navigation: t("dev.demoLabels.navigation"),
      disabled: t("dev.demoLabels.disabled"),
      pressed: t("dev.demoLabels.pressed"),
      idle: t("dev.demoLabels.idle"),
      add: t("dev.demoLabels.add"),
      icon: t("dev.demoLabels.icon"),
      buttonFeedback: t("dev.demoLabels.buttonFeedback"),
      buttonCount: (count: number) =>
        t("dev.demoLabels.buttonCount", { count }),
      iconFeedback: (count: number) =>
        t("dev.demoLabels.iconFeedback", { count }),
      zero: t("dev.demoLabels.zero"),
      overflow: t("dev.demoLabels.overflow"),
      attention: t("dev.demoLabels.attention"),
      inactive: t("dev.demoLabels.inactive"),
      files: t("dev.demoLabels.files"),
      preview: t("dev.demoLabels.preview"),
      settings: t("dev.demoLabels.settings"),
      closeTab: (title: string) => t("dev.demoLabels.closeTab", { title }),
      addTab: t("dev.demoLabels.addTab"),
      tabBody: t("dev.demoLabels.tabBody"),
      tabEmpty: t("dev.demoLabels.tabEmpty"),
      horizontal: t("dev.demoLabels.horizontal"),
      vertical: t("dev.demoLabels.vertical"),
      horizontalLabel: t("dev.demoLabels.horizontalLabel"),
      verticalLabel: t("dev.demoLabels.verticalLabel"),
      mainPanel: t("dev.demoLabels.mainPanel"),
      auxiliaryPanel: t("dev.demoLabels.auxiliaryPanel"),
      hide: t("dev.demoLabels.hide"),
      show: t("dev.demoLabels.show"),
      panelSize: (size: number) =>
        t("dev.demoLabels.panelSize", { size: Math.round(size) }),
      openNavigation: t("dev.demoLabels.openNavigation"),
      closeNavigation: t("dev.demoLabels.closeNavigation"),
      navigationTitle: t("dev.demoLabels.navigationTitle"),
      openSettings: t("dev.demoLabels.openSettings"),
      closeSettings: t("dev.demoLabels.closeSettings"),
      settingsTitle: t("dev.demoLabels.settingsTitle"),
      overview: t("dev.demoLabels.overview"),
      appearance: t("dev.demoLabels.appearance"),
      about: t("dev.demoLabels.about"),
      overlayHint: t("dev.demoLabels.overlayHint"),
      choice: (value: string) => t("dev.demoLabels.choice", { value }),
    }),
    [t],
  );
}

export function useFoundationLabels() {
  const { t } = useI18n();
  return useMemo(
    () => ({
      copy1: t("dev.foundationLabels.copy1"),
      copy2: t("dev.foundationLabels.copy2"),
      copy3: t("dev.foundationLabels.copy3"),
      copy4: t("dev.foundationLabels.copy4"),
      copy5: t("dev.foundationLabels.copy5"),
      copy6: t("dev.foundationLabels.copy6"),
      copy7: t("dev.foundationLabels.copy7"),
      copy8: t("dev.foundationLabels.copy8"),
      copy9: t("dev.foundationLabels.copy9"),
      copy10: t("dev.foundationLabels.copy10"),
      copy11: t("dev.foundationLabels.copy11"),
      copy12: t("dev.foundationLabels.copy12"),
      copy13: t("dev.foundationLabels.copy13"),
      copy14: t("dev.foundationLabels.copy14"),
      copy15: t("dev.foundationLabels.copy15"),
      copy16: t("dev.foundationLabels.copy16"),
      copy17: t("dev.foundationLabels.copy17"),
      copy18: t("dev.foundationLabels.copy18"),
      copy19: t("dev.foundationLabels.copy19"),
      copy20: t("dev.foundationLabels.copy20"),
      copy21: t("dev.foundationLabels.copy21"),
      copy22: t("dev.foundationLabels.copy22"),
      copy23: t("dev.foundationLabels.copy23"),
      copy24: t("dev.foundationLabels.copy24"),
      copy25: t("dev.foundationLabels.copy25"),
      copy26: t("dev.foundationLabels.copy26"),
      copy27: t("dev.foundationLabels.copy27"),
      copy28: t("dev.foundationLabels.copy28"),
      copy29: t("dev.foundationLabels.copy29"),
      copy30: t("dev.foundationLabels.copy30"),
      copy31: t("dev.foundationLabels.copy31"),
    }),
    [t],
  );
}

export function usePresentationLabels() {
  const { t } = useI18n();
  return useMemo(
    () => ({
      keyEnter: "Enter",
      keyEsc: "Esc",
      queued: t("dev.presentationLabels.queued"),
      running: t("dev.presentationLabels.running"),
      failed: t("dev.presentationLabels.failed"),
      saved: t("dev.presentationLabels.saved"),
      apply: t("dev.presentationLabels.apply"),
      cancel: t("dev.presentationLabels.cancel"),
      noticeTitle: t("dev.presentationLabels.noticeTitle"),
      notice: t("dev.presentationLabels.notice"),
      retry: t("dev.presentationLabels.retry"),
      noticeReady: t("dev.presentationLabels.noticeReady"),
      emptyTitle: t("dev.presentationLabels.emptyTitle"),
      emptyDescription: t("dev.presentationLabels.emptyDescription"),
      emptyNote: t("dev.presentationLabels.emptyNote"),
      choose: t("dev.presentationLabels.choose"),
      copy: t("dev.presentationLabels.copy"),
      copyText: t("dev.presentationLabels.copyText"),
      assistant: t("dev.presentationLabels.assistant"),
      message: t("dev.presentationLabels.message"),
      conversationPrompt: t("dev.presentationLabels.conversationPrompt"),
      previewQuestion: t("dev.presentationLabels.previewQuestion"),
      conversationThinking: t("dev.presentationLabels.conversationThinking"),
      conversationReply: t("dev.presentationLabels.conversationReply"),
      tool: t("dev.presentationLabels.tool"),
      toolOutput: t("dev.presentationLabels.toolOutput"),
      nativeTitle: t("dev.presentationLabels.nativeTitle"),
      nativeMessage: t("dev.presentationLabels.nativeMessage"),
      option: t("dev.presentationLabels.option"),
      alternative: t("dev.presentationLabels.alternative"),
      optionDescription: t("dev.presentationLabels.optionDescription"),
      answered: t("dev.presentationLabels.answered"),
      waiting: t("dev.presentationLabels.waiting"),
      longOption: t("dev.presentationLabels.longOption"),
      nested: t("dev.presentationLabels.nested"),
      nestedDescription: t("dev.presentationLabels.nestedDescription"),
      nestedLabel: t("dev.presentationLabels.nestedLabel"),
      nestedHint: t("dev.presentationLabels.nestedHint"),
    }),
    [t],
  );
}
