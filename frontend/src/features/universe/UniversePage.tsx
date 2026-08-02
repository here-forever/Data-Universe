import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CircleGauge,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { RecoverableError } from "../../app/RecoverableError";
import { useCollaboration } from "../collaboration/collaborationState";
import { LlmSettingsButton } from "../ai/LlmSettingsButton";
import {
  llmRequestConfig,
  useWorkspaceStore,
} from "../workspace/workspaceStore";
import { useI18n } from "../../i18n";
import { type ParticlePoint, queryKeys, vibeApi } from "../../lib/vibeApi";

const ParticleUniverse = lazy(() => import("./ParticleUniverse"));

interface MappingState {
  x: string;
  y: string;
  z: string;
  color: string;
}

const emptyMapping: MappingState = { x: "", y: "", z: "", color: "" };

export default function UniversePage() {
  const queryClient = useQueryClient();
  const activeDatasetId = useWorkspaceStore((state) => state.activeDatasetId);
  const setActiveDataset = useWorkspaceStore((state) => state.setActiveDataset);
  const paused = useWorkspaceStore((state) => state.scenePaused);
  const setPaused = useWorkspaceStore((state) => state.setScenePaused);
  const selectedParticleId = useWorkspaceStore(
    (state) => state.selectedParticleId,
  );
  const setSelectedParticle = useWorkspaceStore(
    (state) => state.setSelectedParticle,
  );
  const theme = useWorkspaceStore((state) => state.theme);
  const llm = useWorkspaceStore((state) => state.llm);
  const llmRevision = useWorkspaceStore((state) => state.llmRevision);
  const activeLlm = llmRequestConfig(llm);
  const { formatNumber, language, t } = useI18n();
  const { particleMapping, send } = useCollaboration();
  const defaultQuestion = t("universe.defaultQuestion");
  const previousDefaultQuestion = useRef(defaultQuestion);
  const [question, setQuestion] = useState(defaultQuestion);
  const bootstrapStarted = useRef(false);

  useEffect(() => {
    const previousDefault = previousDefaultQuestion.current;
    previousDefaultQuestion.current = defaultQuestion;
    setQuestion((current) =>
      current === previousDefault ? defaultQuestion : current,
    );
  }, [defaultQuestion]);

  const datasets = useQuery({
    queryKey: queryKeys.datasets,
    queryFn: vibeApi.listDatasets,
  });
  const createDemo = useMutation({
    mutationFn: vibeApi.createDemo,
    onSuccess: (dataset) => {
      setActiveDataset(dataset.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.datasets });
    },
  });

  useEffect(() => {
    if (
      datasets.isSuccess &&
      datasets.data.length === 0 &&
      !bootstrapStarted.current
    ) {
      bootstrapStarted.current = true;
      createDemo.mutate();
    }
  }, [createDemo, datasets.data, datasets.isSuccess]);

  const datasetId = activeDatasetId ?? datasets.data?.[0]?.id ?? null;
  const dataset = useQuery({
    queryKey: queryKeys.dataset(datasetId),
    queryFn: () => vibeApi.getDataset(datasetId!),
    enabled: Boolean(datasetId),
  });

  const suggestedMapping = dataset.data?.profile.mapping;
  const mapping = useMemo<MappingState>(
    () => ({
      x: particleMapping?.x ?? suggestedMapping?.x ?? "",
      y: particleMapping?.y ?? suggestedMapping?.y ?? "",
      z: particleMapping?.z ?? suggestedMapping?.z ?? "",
      color: particleMapping?.color ?? suggestedMapping?.color ?? "",
    }),
    [
      particleMapping?.color,
      particleMapping?.x,
      particleMapping?.y,
      particleMapping?.z,
      suggestedMapping?.color,
      suggestedMapping?.x,
      suggestedMapping?.y,
      suggestedMapping?.z,
    ],
  );

  const particleRequest = useMemo(
    () => ({
      ...(mapping.x ? { x: mapping.x } : {}),
      ...(mapping.y ? { y: mapping.y } : {}),
      ...(mapping.z ? { z: mapping.z } : {}),
      ...(mapping.color ? { color: mapping.color } : {}),
      limit: 1400,
    }),
    [mapping],
  );
  const particles = useQuery({
    queryKey: queryKeys.particles(datasetId, particleRequest),
    queryFn: () => vibeApi.getParticles(datasetId!, particleRequest),
    enabled: Boolean(datasetId && dataset.data),
  });
  const guide = useQuery({
    queryKey: ["insights", datasetId, "guide", language, llmRevision],
    queryFn: () =>
      vibeApi.ask(datasetId!, t("universe.guideQuestion"), language, activeLlm),
    enabled: Boolean(datasetId),
    staleTime: 5 * 60_000,
  });
  const ask = useMutation({
    mutationFn: (prompt: string) =>
      vibeApi.ask(datasetId!, prompt, language, activeLlm),
  });

  const numericFields =
    dataset.data?.profile.columns.filter(
      (column) => column.kind === "numeric",
    ) ?? [];
  const colorFields =
    dataset.data?.profile.columns.filter((column) =>
      ["categorical", "boolean", "text", "numeric"].includes(column.kind),
    ) ?? [];
  const selectedPoint = particles.data?.points.find(
    (point) => point.id === selectedParticleId,
  );
  const narration = ask.data ?? guide.data;

  const updateMapping = (key: keyof MappingState, value: string) => {
    const next = { ...mapping, [key]: value };
    send("particle_mapping", { mapping: next });
  };
  const selectPoint = (point: ParticlePoint | null) => {
    setSelectedParticle(point?.id ?? null);
    if (point) send("particle_selection", { id: point.id, label: point.label });
  };

  if (!datasetId || dataset.isLoading || createDemo.isPending) {
    return (
      <section className="universe-page universe-empty">
        <span className="loading-orbit" />
        <h1>{t("universe.loadingTitle")}</h1>
        <p>{t("universe.loadingBody")}</p>
      </section>
    );
  }

  if (dataset.isError) {
    return (
      <section className="universe-page universe-empty">
        <RecoverableError
          className="universe-recoverable-error"
          isRetrying={dataset.isFetching}
          message={dataset.error.message}
          onRetry={() => void dataset.refetch()}
          title={t("universe.errorTitle")}
        />
      </section>
    );
  }

  return (
    <section className="universe-page">
      <div className="universe-canvas" aria-label={t("universe.canvasLabel")}>
        <Suspense
          fallback={
            <div className="canvas-loading">
              <LoaderCircle className="spin" />
              {t("universe.gathering")}
            </div>
          }
        >
          <ParticleUniverse
            onSelect={selectPoint}
            paused={paused}
            points={particles.data?.points ?? []}
            selectedId={selectedParticleId}
            theme={theme}
          />
        </Suspense>
      </div>

      <div className="universe-heading">
        <span className="eyebrow">
          <Sparkles size={14} /> {t("universe.liveField")}
        </span>
        <h1>{dataset.data?.name}</h1>
        <p>{dataset.data?.source_filename}</p>
        <div className="universe-metrics">
          <span>
            <strong>{formatNumber(dataset.data?.row_count ?? 0)}</strong>{" "}
            {t("universe.rows")}
          </span>
          <span>
            <strong>{dataset.data?.column_count}</strong> {t("universe.fields")}
          </span>
          <span>
            <strong>{dataset.data?.quality_score}</strong>{" "}
            {t("universe.quality")}
          </span>
        </div>
      </div>

      <aside className="narrator-panel">
        <div className="panel-heading">
          <span className="panel-icon coral">
            <Bot size={18} />
          </span>
          <div>
            <strong>{t("universe.narrator")}</strong>
            <small>
              {narration?.mode === "external_llm"
                ? `${t("universe.externalGuide")} · ${narration.model}`
                : t("universe.statisticalGuide")}
            </small>
          </div>
          <LlmSettingsButton />
        </div>
        <p className="narration-text">
          {ask.isPending || guide.isLoading
            ? t("universe.reading")
            : narration?.answer}
        </p>
        {narration?.evidence.slice(0, 2).map((item) => (
          <span className="evidence-line" key={item}>
            {item}
          </span>
        ))}
        {ask.isError || guide.isError ? (
          <p className="form-error narrator-error">
            {(ask.error ?? guide.error)?.message}
          </p>
        ) : null}
        <form
          className="narrator-input"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim()) ask.mutate(question.trim());
          }}
        >
          <input
            aria-label={t("universe.askLabel")}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("universe.askPlaceholder")}
            value={question}
          />
          <button
            disabled={ask.isPending}
            title={t("universe.send")}
            type="submit"
          >
            <Send size={16} />
          </button>
        </form>
      </aside>

      {selectedPoint && (
        <aside className="particle-inspector">
          <div className="inspector-title">
            <CircleGauge size={17} />
            <strong>{selectedPoint.label}</strong>
          </div>
          <dl>
            {Object.entries(selectedPoint.values)
              .slice(0, 6)
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value ?? t("common.missing"))}</dd>
                </div>
              ))}
          </dl>
        </aside>
      )}

      <div className="universe-controls">
        <div className="mapping-controls">
          {(["x", "y", "z"] as const).map((axis) => (
            <label key={axis}>
              <span>{t("universe.axis", { axis: axis.toUpperCase() })}</span>
              <select
                onChange={(event) => updateMapping(axis, event.target.value)}
                value={mapping[axis]}
              >
                <option value="">{t("universe.autoPath")}</option>
                {numericFields.map((field) => (
                  <option key={field.name} value={field.name}>
                    {field.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            <span>{t("universe.color")}</span>
            <select
              onChange={(event) => updateMapping("color", event.target.value)}
              value={mapping.color}
            >
              <option value="">{t("universe.singleGroup")}</option>
              {colorFields.map((field) => (
                <option key={field.name} value={field.name}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="scene-actions">
          <button
            className="icon-button"
            onClick={() => setPaused(!paused)}
            title={paused ? t("universe.resume") : t("universe.pause")}
            type="button"
          >
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button
            className="icon-button"
            onClick={() => {
              send("particle_mapping", { mapping: emptyMapping });
              setSelectedParticle(null);
            }}
            title={t("universe.reset")}
            type="button"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
