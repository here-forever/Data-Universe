import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Settings2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  type LlmProvider,
  type LlmRequestConfig,
  type LlmSettings,
  llmRequestConfig,
  useWorkspaceStore,
} from "../workspace/workspaceStore";
import { useI18n } from "../../i18n";
import { vibeApi } from "../../lib/vibeApi";

const providerPresets: Record<
  Exclude<LlmProvider, "custom">,
  Pick<LlmSettings, "apiStyle" | "baseUrl" | "model">
> = {
  openai: {
    apiStyle: "responses",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
  },
  deepseek: {
    apiStyle: "chat_completions",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  qwen: {
    apiStyle: "chat_completions",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
};

export function LlmSettingsButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="icon-button llm-settings-trigger"
        onClick={() => setOpen(true)}
        title={t("ai.configure")}
        type="button"
      >
        <Settings2 size={16} />
      </button>
      {open ? <LlmSettingsDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LlmSettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const saved = useWorkspaceStore((state) => state.llm);
  const setLlm = useWorkspaceStore((state) => state.setLlm);
  const [draft, setDraft] = useState(saved);
  const [showKey, setShowKey] = useState(false);
  const check = useMutation({
    mutationFn: (config: LlmRequestConfig) => vibeApi.checkLlm(config),
  });

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const update = <TKey extends keyof LlmSettings>(
    key: TKey,
    value: LlmSettings[TKey],
  ) => {
    check.reset();
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const chooseProvider = (provider: LlmProvider) => {
    check.reset();
    setDraft((current) => ({
      ...current,
      ...(provider === "custom" ? {} : providerPresets[provider]),
      provider,
    }));
  };
  const request = llmRequestConfig({ ...draft, enabled: true });
  const valid = Boolean(request?.base_url && request.model);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        aria-labelledby="llm-settings-title"
        aria-modal="true"
        className="llm-settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          setLlm(draft);
          onClose();
        }}
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">AI NARRATOR</span>
            <h2 id="llm-settings-title">{t("ai.settings")}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            title={t("common.close")}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="llm-settings-fields">
          <label className="field-label">
            <span>{t("ai.provider")}</span>
            <select
              onChange={(event) =>
                chooseProvider(event.target.value as LlmProvider)
              }
              value={draft.provider}
            >
              <option value="openai">{t("ai.provider.openai")}</option>
              <option value="deepseek">{t("ai.provider.deepseek")}</option>
              <option value="qwen">{t("ai.provider.qwen")}</option>
              <option value="custom">{t("ai.provider.custom")}</option>
            </select>
          </label>
          <label className="field-label">
            <span>{t("ai.protocol")}</span>
            <select
              onChange={(event) =>
                update(
                  "apiStyle",
                  event.target.value as LlmSettings["apiStyle"],
                )
              }
              value={draft.apiStyle}
            >
              <option value="responses">{t("ai.responsesApi")}</option>
              <option value="chat_completions">
                {t("ai.chatCompletions")}
              </option>
            </select>
          </label>
          <label className="field-label llm-span-two">
            <span>{t("ai.baseUrl")}</span>
            <input
              onChange={(event) => update("baseUrl", event.target.value)}
              placeholder={t("ai.baseUrlPlaceholder")}
              required
              type="url"
              value={draft.baseUrl}
            />
          </label>
          <label className="field-label">
            <span>{t("ai.model")}</span>
            <input
              onChange={(event) => update("model", event.target.value)}
              placeholder={t("ai.modelPlaceholder")}
              required
              value={draft.model}
            />
          </label>
          <label className="field-label">
            <span>{t("ai.apiKey")}</span>
            <span className="secret-input">
              <input
                autoComplete="off"
                onChange={(event) => update("apiKey", event.target.value)}
                placeholder={t("ai.apiKeyPlaceholder")}
                type={showKey ? "text" : "password"}
                value={draft.apiKey}
              />
              <button
                onClick={() => setShowKey((current) => !current)}
                title={showKey ? t("ai.hideKey") : t("ai.showKey")}
                type="button"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>
        </div>

        <label className="llm-enable-row">
          <input
            checked={draft.enabled}
            onChange={(event) => update("enabled", event.target.checked)}
            type="checkbox"
          />
          <span>{t("ai.enable")}</span>
        </label>
        <p className="llm-security-note">{t("ai.sessionOnly")}</p>

        {check.isSuccess ? (
          <p className="form-success">
            <CheckCircle2 size={15} />
            {t("ai.connected", { model: check.data.model })}
          </p>
        ) : null}
        {check.isError ? (
          <p className="form-error">
            <AlertTriangle size={15} />
            {check.error.message}
          </p>
        ) : null}

        <div className="dialog-actions llm-dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            {t("common.cancel")}
          </button>
          <button
            className="secondary-button"
            disabled={!valid || check.isPending}
            onClick={() => request && check.mutate(request)}
            type="button"
          >
            {check.isPending ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            {check.isPending ? t("ai.testing") : t("ai.test")}
          </button>
          <button className="command-button" disabled={!valid} type="submit">
            <Settings2 size={15} />
            {t("ai.apply")}
          </button>
        </div>
      </form>
    </div>,
    document.querySelector(".app-shell") ?? document.body,
  );
}
