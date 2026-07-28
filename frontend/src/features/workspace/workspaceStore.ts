import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "zh-CN" | "en-US";
export type LlmApiStyle = "responses" | "chat_completions";
export type LlmProvider = "openai" | "deepseek" | "qwen" | "custom";

export interface LlmSettings {
  apiKey: string;
  apiStyle: LlmApiStyle;
  baseUrl: string;
  enabled: boolean;
  model: string;
  provider: LlmProvider;
}

export interface LlmRequestConfig {
  api_key?: string;
  api_style: LlmApiStyle;
  base_url: string;
  model: string;
}

export const defaultLlmSettings: LlmSettings = {
  apiKey: "",
  apiStyle: "responses",
  baseUrl: "https://api.openai.com/v1",
  enabled: false,
  model: "gpt-5-mini",
  provider: "openai",
};

export function llmRequestConfig(
  settings: LlmSettings,
): LlmRequestConfig | undefined {
  if (!settings.enabled) return undefined;
  return {
    ...(settings.apiKey ? { api_key: settings.apiKey } : {}),
    api_style: settings.apiStyle,
    base_url: settings.baseUrl.trim().replace(/\/$/, ""),
    model: settings.model.trim(),
  };
}

interface WorkspaceState {
  activeDatasetId: string | null;
  language: Language;
  llm: LlmSettings;
  llmRevision: number;
  scenePaused: boolean;
  selectedParticleId: number | null;
  theme: "dark" | "light";
  setActiveDataset: (datasetId: string | null) => void;
  setLanguage: (language: Language) => void;
  setLlm: (settings: LlmSettings) => void;
  setScenePaused: (paused: boolean) => void;
  setSelectedParticle: (particleId: number | null) => void;
  toggleTheme: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeDatasetId: null,
      language: "zh-CN",
      llm: defaultLlmSettings,
      llmRevision: 0,
      scenePaused: false,
      selectedParticleId: null,
      theme: "dark",
      setActiveDataset: (activeDatasetId) => set({ activeDatasetId }),
      setLanguage: (language) => set({ language }),
      setLlm: (llm) =>
        set((state) => ({ llm, llmRevision: state.llmRevision + 1 })),
      setScenePaused: (scenePaused) => set({ scenePaused }),
      setSelectedParticle: (selectedParticleId) => set({ selectedParticleId }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
    }),
    {
      name: "vibe-data-universe.workspace",
      partialize: (state) => ({
        activeDatasetId: state.activeDatasetId,
        language: state.language,
        llm: {
          ...state.llm,
          apiKey: "",
          enabled: false,
        },
        theme: state.theme,
      }),
    },
  ),
);
