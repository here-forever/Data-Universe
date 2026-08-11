import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  FlaskConical,
  History,
  LoaderCircle,
  Send,
  Sigma,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n, type TranslationKey } from "../../i18n";
import {
  type AnalysisRun,
  type ColumnProfile,
  queryKeys,
  vibeApi,
} from "../../lib/vibeApi";
import { LlmSettingsButton } from "../ai/LlmSettingsButton";
import {
  llmRequestConfig,
  useWorkspaceStore,
} from "../workspace/workspaceStore";

type AdvancedMethod = "regression" | "hypothesis" | "clustering";
type Translator = ReturnType<typeof useI18n>["t"];

const methodNameKeys: Record<string, TranslationKey> = {
  regression: "analysis.name.regression",
  hypothesis: "analysis.name.hypothesis",
  clustering: "analysis.name.clustering",
  explore: "analysis.name.explore",
  question: "analysis.name.question",
};

const metricNameKeys: Record<string, TranslationKey> = {
  observations: "analysis.metric.observations",
  coefficient: "analysis.metric.coefficient",
  intercept: "analysis.metric.intercept",
  r_squared: "analysis.metric.r_squared",
  rmse: "analysis.metric.rmse",
  statistic: "analysis.metric.statistic",
  p_value: "analysis.metric.p_value",
  significant: "analysis.metric.significant",
  clusters: "analysis.metric.clusters",
  silhouette_score: "analysis.metric.silhouette_score",
};

export function AskWorkspace({ datasetId }: { datasetId: string }) {
  const queryClient = useQueryClient();
  const { language, t } = useI18n();
  const defaultQuestion = t("analysis.defaultQuestion");
  const llm = useWorkspaceStore((state) => state.llm);
  const activeLlm = llmRequestConfig(llm);
  const previousDefaultQuestion = useRef(defaultQuestion);
  const [question, setQuestion] = useState(defaultQuestion);
  const [conversation, setConversation] = useState<
    Array<{
      question: string;
      answer: string;
      evidence: string[];
      model: string | null;
    }>
  >([]);
  useEffect(() => {
    const previousDefault = previousDefaultQuestion.current;
    previousDefaultQuestion.current = defaultQuestion;
    setQuestion((current) =>
      current === previousDefault ? defaultQuestion : current,
    );
  }, [defaultQuestion]);
  const ask = useMutation({
    mutationFn: (prompt: string) =>
      vibeApi.ask(datasetId, prompt, language, activeLlm),
    onSuccess: (response, prompt) => {
      setConversation((current) => [
        ...current,
        {
          question: prompt,
          answer: response.answer,
          evidence: response.evidence,
          model: response.model,
        },
      ]);
      setQuestion("");
      void queryClient.invalidateQueries({
        queryKey: queryKeys.history(datasetId),
      });
    },
  });
  const submit = () => {
    if (question.trim()) ask.mutate(question.trim());
  };
  return (
    <div className="ask-workspace">
      <div className="conversation-stream">
        <div className="guide-message">
          <span className="panel-icon coral">
            <Bot size={18} />
          </span>
          <div>
            <strong>{t("analysis.narrator")}</strong>
            <small className="narrator-model-status">
              {activeLlm
                ? t("ai.activeModel", { model: activeLlm.model })
                : t("ai.localMode")}
            </small>
            <p>{t("analysis.narratorIntro")}</p>
          </div>
          <LlmSettingsButton />
        </div>
        {conversation.map((message, index) => (
          <div
            className="conversation-turn"
            key={`${message.question}-${index}`}
          >
            <div className="user-question">
              <span>{t("analysis.you")}</span>
              <p>{message.question}</p>
            </div>
            <div className="guide-answer">
              <span className="panel-icon sea">
                <Bot size={17} />
              </span>
              <div>
                {message.model ? (
                  <span className="model-chip">{message.model}</span>
                ) : null}
                <p>{message.answer}</p>
                <div className="evidence-stack">
                  {message.evidence.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        {ask.isPending && (
          <div className="guide-answer">
            <span className="panel-icon sea">
              <LoaderCircle className="spin" size={17} />
            </span>
            <p>{t("analysis.searchingEvidence")}</p>
          </div>
        )}
        {ask.isError ? (
          <p className="form-error ask-error">
            <AlertTriangle size={15} />
            {ask.error.message}
          </p>
        ) : null}
      </div>
      <form
        className="ask-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          aria-label={t("analysis.questionLabel")}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("analysis.questionPlaceholder")}
          rows={3}
          value={question}
        />
        <div>
          <span>{t("analysis.privacy")}</span>
          <button
            className="command-button"
            disabled={!question.trim() || ask.isPending}
            type="submit"
          >
            <Send size={16} />
            {t("analysis.start")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdvancedWorkspace({
  columns,
  datasetId,
}: {
  columns: ColumnProfile[];
  datasetId: string;
}) {
  const queryClient = useQueryClient();
  const { formatDateTime, t } = useI18n();
  const numeric = columns.filter((column) => column.kind === "numeric");
  const categorical = columns.filter((column) =>
    ["categorical", "boolean", "text"].includes(column.kind),
  );
  const [method, setMethod] = useState<AdvancedMethod>("regression");
  const [feature, setFeature] = useState(numeric[0]?.name ?? "");
  const [target, setTarget] = useState(
    numeric[1]?.name ?? numeric[0]?.name ?? "",
  );
  const [groupField, setGroupField] = useState(categorical[0]?.name ?? "");
  const [groupA, setGroupA] = useState(
    categorical[0]?.top_values?.[0]?.value ?? "",
  );
  const [groupB, setGroupB] = useState(
    categorical[0]?.top_values?.[1]?.value ?? "",
  );
  const [clusterFields, setClusterFields] = useState<string[]>(
    numeric.slice(0, 3).map((item) => item.name),
  );
  const [clusters, setClusters] = useState(3);
  const analysis = useMutation({
    mutationFn: () =>
      vibeApi.advanced(
        datasetId,
        method === "regression"
          ? { method, feature, target }
          : method === "hypothesis"
            ? {
                method,
                target,
                group_field: groupField,
                group_a: groupA,
                group_b: groupB,
              }
            : { method, fields: clusterFields, clusters },
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.history(datasetId),
      }),
  });
  const history = useQuery({
    queryKey: queryKeys.history(datasetId),
    queryFn: () => vibeApi.history(datasetId),
  });
  const selectedGroup = columns.find((column) => column.name === groupField);
  const groupValues =
    selectedGroup?.top_values?.map((item) => item.value) ?? [];
  const canRun =
    method === "regression"
      ? Boolean(feature && target && feature !== target)
      : method === "hypothesis"
        ? Boolean(target && groupField && groupA && groupB && groupA !== groupB)
        : clusterFields.length >= 2;
  return (
    <div className="advanced-workspace">
      <section className="method-builder">
        <div className="method-switcher">
          {(
            [
              [
                "regression",
                t("analysis.method.regression"),
                t("analysis.method.regressionDescription"),
              ],
              [
                "hypothesis",
                t("analysis.method.hypothesis"),
                t("analysis.method.hypothesisDescription"),
              ],
              [
                "clustering",
                t("analysis.method.clustering"),
                t("analysis.method.clusteringDescription"),
              ],
            ] as const
          ).map(([value, label, description]) => (
            <button
              className={method === value ? "is-active" : ""}
              key={value}
              onClick={() => {
                setMethod(value);
                analysis.reset();
              }}
              type="button"
            >
              <strong>{label}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
        <div className="method-fields">
          {method === "regression" && (
            <>
              <SelectField
                label={t("analysis.featureField")}
                onChange={setFeature}
                options={numeric.map((item) => item.name)}
                value={feature}
              />
              <SelectField
                label={t("analysis.targetField")}
                onChange={setTarget}
                options={numeric.map((item) => item.name)}
                value={target}
              />
            </>
          )}
          {method === "hypothesis" && (
            <>
              <SelectField
                label={t("analysis.numericMetric")}
                onChange={setTarget}
                options={numeric.map((item) => item.name)}
                value={target}
              />
              <SelectField
                label={t("analysis.groupField")}
                onChange={(value) => {
                  setGroupField(value);
                  const values =
                    columns.find((item) => item.name === value)?.top_values ??
                    [];
                  setGroupA(values[0]?.value ?? "");
                  setGroupB(values[1]?.value ?? "");
                }}
                options={categorical.map((item) => item.name)}
                value={groupField}
              />
              <SelectField
                label={t("analysis.groupA")}
                onChange={setGroupA}
                options={groupValues}
                value={groupA}
              />
              <SelectField
                label={t("analysis.groupB")}
                onChange={setGroupB}
                options={groupValues}
                value={groupB}
              />
            </>
          )}
          {method === "clustering" && (
            <>
              <div className="cluster-field-list">
                <span>{t("analysis.clusterFields")}</span>
                {numeric.map((item) => (
                  <label key={item.name}>
                    <input
                      checked={clusterFields.includes(item.name)}
                      onChange={() =>
                        setClusterFields((current) =>
                          current.includes(item.name)
                            ? current.filter((field) => field !== item.name)
                            : [...current, item.name],
                        )
                      }
                      type="checkbox"
                    />
                    {item.name}
                  </label>
                ))}
              </div>
              <label className="field-label compact-field">
                <span>{t("analysis.clusterCount")}</span>
                <input
                  max={8}
                  min={2}
                  onChange={(event) => setClusters(Number(event.target.value))}
                  type="number"
                  value={clusters}
                />
              </label>
            </>
          )}
        </div>
        {analysis.isError && (
          <p className="form-error">
            <AlertTriangle size={15} />
            {analysis.error.message}
          </p>
        )}
        <button
          className="command-button"
          disabled={!canRun || analysis.isPending}
          onClick={() => analysis.mutate()}
          type="button"
        >
          {analysis.isPending ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <FlaskConical size={16} />
          )}
          {analysis.isPending ? t("analysis.modelRunning") : t("analysis.run")}
        </button>
      </section>
      <section className="analysis-result">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("analysis.result")}</span>
            <h2>{t("analysis.result")}</h2>
          </div>
        </div>
        {analysis.data ? (
          <ResultView run={analysis.data} />
        ) : (
          <div className="empty-result">
            <Sigma size={28} />
            <p>{t("analysis.resultEmpty")}</p>
          </div>
        )}
      </section>
      <aside className="analysis-history">
        <div className="section-label">
          <span>
            <History size={14} />
            {t("analysis.recent")}
          </span>
          <strong>{history.data?.length ?? 0}</strong>
        </div>
        {history.data?.slice(0, 8).map((run) => (
          <div className="history-row" key={run.id}>
            <span className={`method-dot method-${run.kind}`} />
            <div>
              <strong>{methodName(run.kind, t)}</strong>
              <small>{formatDateTime(run.created_at)}</small>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  const { t } = useI18n();
  return (
    <label className="field-label compact-field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {!options.length && (
          <option value="">{t("common.noAvailableField")}</option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultView({ run }: { run: AnalysisRun }) {
  const { formatNumber, t } = useI18n();
  const result = run.result;
  const metrics = Object.entries(result)
    .filter(
      ([, value]) => typeof value === "number" || typeof value === "boolean",
    )
    .slice(0, 8);
  return (
    <div className="result-content">
      <span className="result-method">{methodName(run.kind, t)}</span>
      <div className="result-metrics">
        {metrics.map(([key, value]) => (
          <div key={key}>
            <small>
              {metricNameKeys[key]
                ? t(metricNameKeys[key])
                : key.replaceAll("_", " ")}
            </small>
            <strong>
              {typeof value === "number"
                ? formatNumber(Number(value), {
                    maximumFractionDigits: 4,
                  })
                : value
                  ? t("common.yes")
                  : t("common.no")}
            </strong>
          </div>
        ))}
      </div>
      {Array.isArray(result.centers) && (
        <div className="center-list">
          <strong>{t("analysis.clusterCenters")}</strong>
          {(result.centers as Array<Record<string, number>>).map(
            (center, index) => (
              <div key={index}>
                <span>{t("analysis.clusterNumber", { count: index + 1 })}</span>
                {Object.entries(center).map(([key, value]) => (
                  <small key={key}>
                    {key}: {value}
                  </small>
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function methodName(method: string, t: Translator) {
  const key = methodNameKeys[method];
  return key ? t(key) : method;
}
