import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Check, Plus, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useI18n, type TranslationKey } from "../../i18n";
import {
  type CleaningAction,
  type CleaningResultStep,
  type CleaningStep,
  type ColumnProfile,
  vibeApi,
} from "../../lib/vibeApi";

interface EditableStep extends CleaningStep {
  key: string;
}

const actionLabelKeys: Record<CleaningAction, TranslationKey> = {
  drop_duplicates: "data.action.drop_duplicates",
  drop_missing: "data.action.drop_missing",
  fill_missing: "data.action.fill_missing",
  flag_outliers: "data.action.flag_outliers",
};

function makeStep(
  action: CleaningAction = "drop_duplicates",
  column = "",
): EditableStep {
  return {
    key: crypto.randomUUID(),
    action,
    ...(action === "drop_missing" ? { columns: column ? [column] : [] } : {}),
    ...(action === "fill_missing" ? { column, strategy: "mean" } : {}),
    ...(action === "flag_outliers" ? { column } : {}),
  };
}

export function CleaningPanel({
  columns,
  datasetId,
  history,
  onApplied,
}: {
  columns: ColumnProfile[];
  datasetId: string;
  history: CleaningResultStep[];
  onApplied: (stepCount: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const defaultLabel = t("data.defaultRevisionLabel");
  const previousDefaultLabel = useRef(defaultLabel);
  const [label, setLabel] = useState(defaultLabel);
  const [steps, setSteps] = useState<EditableStep[]>([makeStep()]);
  const actionLabels = useMemo<Record<CleaningAction, string>>(
    () => ({
      drop_duplicates: t(actionLabelKeys.drop_duplicates),
      drop_missing: t(actionLabelKeys.drop_missing),
      fill_missing: t(actionLabelKeys.fill_missing),
      flag_outliers: t(actionLabelKeys.flag_outliers),
    }),
    [t],
  );

  useEffect(() => {
    const previousDefault = previousDefaultLabel.current;
    previousDefaultLabel.current = defaultLabel;
    setLabel((current) =>
      current === previousDefault ? defaultLabel : current,
    );
  }, [defaultLabel]);
  const clean = useMutation({
    mutationFn: () =>
      vibeApi.cleanDataset(
        datasetId,
        label,
        steps.map(
          ({ action, column, columns: selectedColumns, strategy, value }) => ({
            action,
            column,
            columns: selectedColumns,
            strategy,
            value,
          }),
        ),
      ),
    onSuccess: async () => {
      await onApplied(steps.length);
      setSteps([makeStep()]);
    },
  });
  const updateStep = (key: string, action: CleaningAction, column: string) => {
    setSteps((current) =>
      current.map((step) =>
        step.key === key ? makeStep(action, column) : step,
      ),
    );
  };
  const patchStep = (key: string, changes: Partial<EditableStep>) => {
    setSteps((current) =>
      current.map((step) =>
        step.key === key ? { ...step, ...changes, key } : step,
      ),
    );
  };
  return (
    <div className="cleaning-layout">
      <div className="cleaning-builder">
        <label className="field-label">
          <span>{t("data.revisionLabel")}</span>
          <input
            maxLength={160}
            onChange={(event) => setLabel(event.target.value)}
            value={label}
          />
        </label>
        <div className="cleaning-steps">
          {steps.map((step, index) => (
            <div className="cleaning-step" key={step.key}>
              <span className="step-index">{index + 1}</span>
              <select
                onChange={(event) =>
                  updateStep(
                    step.key,
                    event.target.value as CleaningAction,
                    columns[0]?.name ?? "",
                  )
                }
                value={step.action}
              >
                {Object.entries(actionLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
              {step.action !== "drop_duplicates" && (
                <select
                  onChange={(event) =>
                    step.action === "drop_missing"
                      ? patchStep(step.key, { columns: [event.target.value] })
                      : patchStep(step.key, { column: event.target.value })
                  }
                  value={
                    step.action === "drop_missing"
                      ? (step.columns?.[0] ?? "")
                      : (step.column ?? "")
                  }
                >
                  <option value="" disabled>
                    {t("data.chooseField")}
                  </option>
                  {columns.map((column) => (
                    <option key={column.name} value={column.name}>
                      {column.name}
                    </option>
                  ))}
                </select>
              )}
              {step.action === "fill_missing" && (
                <select
                  onChange={(event) =>
                    patchStep(step.key, {
                      strategy: event.target.value as CleaningStep["strategy"],
                    })
                  }
                  value={step.strategy ?? "mean"}
                >
                  <option value="mean">{t("data.strategyMean")}</option>
                  <option value="median">{t("data.strategyMedian")}</option>
                  <option value="mode">{t("data.strategyMode")}</option>
                  <option value="value">{t("data.strategyValue")}</option>
                </select>
              )}
              {step.action === "fill_missing" && step.strategy === "value" && (
                <input
                  aria-label={t("data.strategyValue")}
                  onChange={(event) =>
                    patchStep(step.key, { value: event.target.value })
                  }
                  placeholder={t("data.fillValue")}
                  value={String(step.value ?? "")}
                />
              )}
              <button
                className="icon-button"
                disabled={steps.length === 1}
                onClick={() =>
                  setSteps((current) =>
                    current.filter((item) => item.key !== step.key),
                  )
                }
                title={t("data.removeStep")}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="add-step-button"
          onClick={() => setSteps((current) => [...current, makeStep()])}
          type="button"
        >
          <Plus size={16} />
          {t("data.addStep")}
        </button>
        {clean.isError && (
          <p className="form-error">
            <AlertTriangle size={15} />
            {clean.error.message}
          </p>
        )}
        <button
          className="command-button apply-cleaning"
          disabled={
            clean.isPending ||
            steps.some(
              (step) =>
                step.action !== "drop_duplicates" &&
                !(step.column || step.columns?.length),
            )
          }
          onClick={() => clean.mutate()}
          type="button"
        >
          {clean.isPending ? (
            <RefreshCw className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          {clean.isPending
            ? t("data.generatingRevision")
            : t("data.applyRevision")}
        </button>
      </div>
      <div className="revision-history">
        <div className="section-label">
          <span>{t("data.currentRevisionActions")}</span>
          <strong>{history.length}</strong>
        </div>
        {history.length ? (
          history.map((item, index) => (
            <div
              className="revision-row"
              key={`${String(item.action)}-${index}`}
            >
              <span>{index + 1}</span>
              <div>
                <strong>
                  {actionLabels[item.action as CleaningAction] ??
                    String(item.action)}
                </strong>
                <small>
                  {t("data.rowsChanged", {
                    before: String(item.rows_before),
                    after: String(item.rows_after),
                  })}
                </small>
              </div>
            </div>
          ))
        ) : (
          <p>{t("data.noTransformations")}</p>
        )}
      </div>
    </div>
  );
}
