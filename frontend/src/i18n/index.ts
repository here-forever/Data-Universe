import i18next from "i18next";
import { useCallback, useEffect } from "react";
import { initReactI18next, useTranslation } from "react-i18next";

import {
  type Language,
  useWorkspaceStore,
} from "../features/workspace/workspaceStore";
import zhCN, { type TranslationKey } from "./locales/zh-CN";

export type { TranslationKey } from "./locales/zh-CN";

type TranslationValues = Record<string, string | number>;

const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  fallbackLng: "zh-CN",
  initImmediate: false,
  interpolation: {
    escapeValue: false,
    prefix: "{",
    suffix: "}",
  },
  lng: "zh-CN",
  resources: {
    "zh-CN": { translation: zhCN },
  },
  returnNull: false,
  showSupportNotice: false,
});

const localeLoaders = {
  "en-US": () => import("./locales/en-US"),
  "zh-CN": async () => ({ default: zhCN }),
} satisfies Record<
  Language,
  () => Promise<{ default: Record<TranslationKey, string> }>
>;

export async function activateLanguage(language: Language): Promise<void> {
  if (!i18n.hasResourceBundle(language, "translation")) {
    const locale = await localeLoaders[language]();
    i18n.addResourceBundle(language, "translation", locale.default, true, true);
  }
  if (i18n.language !== language) await i18n.changeLanguage(language);
}

export function translate(
  language: Language,
  key: TranslationKey,
  values: TranslationValues = {},
): string {
  return i18n.t(key, {
    ...values,
    defaultValue: key,
    lng: language,
  });
}

export function useI18n() {
  const language = useWorkspaceStore((state) => state.language);
  const setLanguage = useWorkspaceStore((state) => state.setLanguage);
  const { t: translateWithI18next } = useTranslation("translation", {
    i18n,
    useSuspense: false,
  });

  useEffect(() => {
    void activateLanguage(language);
  }, [language]);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      translateWithI18next(key, {
        ...values,
        defaultValue: key,
        lng: language,
      }),
    [language, translateWithI18next],
  );
  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      value.toLocaleString(language, options),
    [language],
  );
  const formatDateTime = useCallback(
    (value: string | number | Date) =>
      new Date(value).toLocaleString(language, {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [language],
  );

  return { formatDateTime, formatNumber, language, setLanguage, t };
}
