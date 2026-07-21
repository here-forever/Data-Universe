import { useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";

export type Language = "zh-CN" | "en-US";

export interface LocalizedText {
  zh: string;
  en: string;
}

const LANGUAGE_STORAGE_KEY = "data-analyse.language";

function readStoredLanguage(): Language {
  if (typeof window === "undefined") {
    return "zh-CN";
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return storedLanguage === "en-US" ? "en-US" : "zh-CN";
}

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: readStoredLanguage(),
  setLanguage: (language) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
    set({ language });
  },
}));

export function useI18n() {
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (zh: string, en: string) => (language === "zh-CN" ? zh : en),
    [language],
  );

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language),
    [language],
  );
  const formatNumber = useCallback(
    (value: number) => numberFormatter.format(value),
    [numberFormatter],
  );

  const formatDate = useCallback(
    (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(language, options).format(new Date(value)),
    [language],
  );

  return { language, setLanguage, t, formatNumber, formatDate };
}

export function localize(text: LocalizedText, language: Language) {
  return language === "zh-CN" ? text.zh : text.en;
}

export function resetLanguageForTests() {
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  useLanguageStore.setState({ language: "zh-CN" });
  document.documentElement.lang = "zh-CN";
}

export function setLanguageForTests(language: Language) {
  useLanguageStore.setState({ language });
  document.documentElement.lang = language;
}
