import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Eraser,
  Eye,
  FileSliders,
  ListFilter,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  createCleaningRecipe,
  executeCleaningRecipe,
  previewCleaning,
  type CleaningExecution,
  type CleaningOperation,
  type CleaningPreview,
  type CleaningStepPayload,
} from "./api";
import { listDatasets, type Dataset } from "../datasets/api";

const DEFAULT_PROJECT_ID = "prj_demo";
const PAGE_SIZE = 20;

interface DraftStep {
  id: string;
  operation: CleaningOperation;
  sourceField: string;
  targetField: string;
  value: string;
  fields: string[];
}

const OPERATIONS: Array<{
  operation: CleaningOperation;
  label: string;
}> = [
  { operation: "rename_field", label: "Rename field" },
  { operation: "fill_null", label: "Fill null" },
  { operation: "drop_null_rows", label: "Drop null rows" },
  { operation: "deduplicate", label: "Deduplicate" },
];

export function CleaningWorkbenchPage() {
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const initialDatasetId = searchParams.get("dataset_id");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(initialProjectId);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    initialDatasetId,
  );
  const [recipeName, setRecipeName] = useState("Cleaning recipe");
  const [outputName, setOutputName] = useState("Cleaned dataset");
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>([]);
  const [latestPreview, setLatestPreview] = useState<CleaningPreview | null>(
    null,
  );

  const datasetsQuery = useQuery({
    queryKey: ["cleaning-datasets", submittedProjectId],
    queryFn: () => listDatasets(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0,
  });

  const datasets = useMemo(
    () => datasetsQuery.data?.items ?? [],
    [datasetsQuery.data?.items],
  );
  const selectedDataset = useMemo(
    () =>
      datasets.find((dataset) => dataset.id === selectedDatasetId) ??
      datasets[0] ??
      null,
    [datasets, selectedDatasetId],
  );
  const activeDatasetId = selectedDataset?.id ?? null;
  const fieldNames = useMemo(
    () => selectedDataset?.fields.map((field) => field.name) ?? [],
    [selectedDataset?.fields],
  );

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!selectedDataset) {
        throw new Error("Select a source dataset first");
      }
      return previewCleaning({
        project_id: selectedDataset.project_id,
        source_dataset_id: selectedDataset.id,
        steps: toStepPayloads(draftSteps),
        page: 1,
        page_size: PAGE_SIZE,
      });
    },
    onSuccess: (preview) => setLatestPreview(preview),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedDataset) {
        throw new Error("Select a source dataset first");
      }
      return createCleaningRecipe({
        project_id: selectedDataset.project_id,
        source_dataset_id: selectedDataset.id,
        name: recipeName.trim(),
        description: null,
        steps: toStepPayloads(draftSteps),
      });
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!saveMutation.data) {
        throw new Error("Save the cleaning recipe before executing it");
      }
      return executeCleaningRecipe(saveMutation.data.id, {
        output_name: outputName.trim(),
      });
    },
  });

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedProjectId(projectId.trim());
    setSelectedDatasetId(null);
    setDraftSteps([]);
    setLatestPreview(null);
  }

  function addStep(operation: CleaningOperation) {
    const firstField = fieldNames[0] ?? "";
    setDraftSteps((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        operation,
        sourceField: firstField,
        targetField:
          operation === "rename_field" && firstField
            ? `${firstField}_clean`
            : "",
        value: "",
        fields: firstField ? [firstField] : [],
      },
    ]);
    setLatestPreview(null);
    saveMutation.reset();
    executeMutation.reset();
  }

  function updateStep(stepId: string, patch: Partial<DraftStep>) {
    setDraftSteps((current) =>
      current.map((step) =>
        step.id === stepId ? { ...step, ...patch } : step,
      ),
    );
    setLatestPreview(null);
    saveMutation.reset();
    executeMutation.reset();
  }

  function removeStep(stepId: string) {
    setDraftSteps((current) => current.filter((step) => step.id !== stepId));
    setLatestPreview(null);
    saveMutation.reset();
    executeMutation.reset();
  }

  const canRun =
    Boolean(selectedDataset) &&
    draftSteps.length > 0 &&
    !previewMutation.isPending;
  const canSave =
    Boolean(selectedDataset) &&
    recipeName.trim().length > 0 &&
    draftSteps.length > 0 &&
    !saveMutation.isPending;
  const canExecute =
    Boolean(saveMutation.data) &&
    outputName.trim().length > 0 &&
    !executeMutation.isPending;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-line pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan">Cleaning</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            Cleaning workbench
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Build reusable visual cleaning recipes from formal datasets and
            preview the result.
          </p>
        </div>

        <form className="flex w-full max-w-xl gap-2" onSubmit={submitProject}>
          <label className="sr-only" htmlFor="cleaning-project-id">
            Project ID
          </label>
          <input
            id="cleaning-project-id"
            className="h-10 flex-1 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder="Project ID"
          />
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            type="submit"
          >
            <RefreshCcw className="h-4 w-4" />
            Load
          </button>
        </form>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <DatasetChooser
          datasets={datasets}
          selectedDatasetId={activeDatasetId}
          isLoading={datasetsQuery.isLoading}
          error={datasetsQuery.error}
          onSelect={(datasetId) => {
            setSelectedDatasetId(datasetId);
            setDraftSteps([]);
            setLatestPreview(null);
            saveMutation.reset();
          }}
        />

        <RecipeBuilder
          dataset={selectedDataset}
          recipeName={recipeName}
          outputName={outputName}
          steps={draftSteps}
          onRecipeNameChange={setRecipeName}
          onOutputNameChange={(value) => {
            setOutputName(value);
            executeMutation.reset();
          }}
          onAddStep={addStep}
          onUpdateStep={updateStep}
          onRemoveStep={removeStep}
          onPreview={() => previewMutation.mutate()}
          onSave={() => saveMutation.mutate()}
          onExecute={() => executeMutation.mutate()}
          canRun={canRun}
          canSave={canSave}
          canExecute={canExecute}
          isPreviewing={previewMutation.isPending}
          isSaving={saveMutation.isPending}
          isExecuting={executeMutation.isPending}
          previewError={previewMutation.error}
          saveError={saveMutation.error}
          executeError={executeMutation.error}
          savedRecipeName={saveMutation.data?.name}
          execution={executeMutation.data}
        />

        <PreviewPanel
          dataset={selectedDataset}
          preview={latestPreview}
          isLoading={previewMutation.isPending}
        />
      </div>
    </section>
  );
}

function DatasetChooser({
  datasets,
  selectedDatasetId,
  isLoading,
  error,
  onSelect,
}: {
  datasets: Dataset[];
  selectedDatasetId: string | null;
  isLoading: boolean;
  error: Error | null;
  onSelect: (datasetId: string) => void;
}) {
  return (
    <aside className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<FileSliders className="h-4 w-4 text-brand" />}
        title="Source dataset"
      />
      <div className="p-3">
        {isLoading ? (
          <StateMessage title="Loading datasets" />
        ) : error ? (
          <StateMessage title="Could not load datasets" tone="error" />
        ) : datasets.length === 0 ? (
          <StateMessage title="No datasets found" />
        ) : (
          <div className="space-y-2">
            {datasets.map((dataset) => {
              const isActive = dataset.id === selectedDatasetId;
              return (
                <button
                  key={dataset.id}
                  className={[
                    "w-full rounded-md border px-3 py-3 text-left transition",
                    isActive
                      ? "border-brand bg-blue-50 shadow-sm"
                      : "border-line bg-white hover:border-cyan hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => onSelect(dataset.id)}
                  type="button"
                >
                  <p className="truncate text-sm font-semibold text-ink">
                    {dataset.name}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                    <span>{dataset.row_count.toLocaleString()} rows</span>
                    <span>{dataset.fields.length} fields</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function RecipeBuilder({
  dataset,
  recipeName,
  outputName,
  steps,
  onRecipeNameChange,
  onOutputNameChange,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  onPreview,
  onSave,
  onExecute,
  canRun,
  canSave,
  canExecute,
  isPreviewing,
  isSaving,
  isExecuting,
  previewError,
  saveError,
  executeError,
  savedRecipeName,
  execution,
}: {
  dataset: Dataset | null;
  recipeName: string;
  outputName: string;
  steps: DraftStep[];
  onRecipeNameChange: (value: string) => void;
  onOutputNameChange: (value: string) => void;
  onAddStep: (operation: CleaningOperation) => void;
  onUpdateStep: (stepId: string, patch: Partial<DraftStep>) => void;
  onRemoveStep: (stepId: string) => void;
  onPreview: () => void;
  onSave: () => void;
  onExecute: () => void;
  canRun: boolean;
  canSave: boolean;
  canExecute: boolean;
  isPreviewing: boolean;
  isSaving: boolean;
  isExecuting: boolean;
  previewError: Error | null;
  saveError: Error | null;
  executeError: Error | null;
  savedRecipeName?: string;
  execution?: CleaningExecution;
}) {
  const fieldNames = dataset?.fields.map((field) => field.name) ?? [];

  return (
    <div className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<ListFilter className="h-4 w-4 text-brand" />}
        title="Recipe builder"
      />
      <div className="space-y-4 p-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-muted">
            Recipe name
          </span>
          <input
            aria-label="Recipe name"
            className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
            value={recipeName}
            onChange={(event) => onRecipeNameChange(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase text-muted">
            Output dataset
          </span>
          <input
            aria-label="Output dataset"
            className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
            value={outputName}
            onChange={(event) => onOutputNameChange(event.target.value)}
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          {OPERATIONS.map((item) => (
            <button
              key={item.operation}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!dataset}
              onClick={() => onAddStep(item.operation)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        {steps.length === 0 ? (
          <StateMessage title="Add a cleaning step to start" />
        ) : (
          <div className="space-y-3">
            {steps.map((step, index) => (
              <StepEditor
                key={step.id}
                index={index}
                step={step}
                fieldNames={fieldNames}
                onChange={(patch) => onUpdateStep(step.id, patch)}
                onRemove={() => onRemoveStep(step.id)}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canRun}
            onClick={onPreview}
            type="button"
          >
            <Eye className="h-4 w-4" />
            {isPreviewing ? "Previewing..." : "Preview"}
          </button>
          <button
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-emerald px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSave}
            onClick={onSave}
            type="button"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save recipe"}
          </button>
        </div>

        <button
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald/30 bg-white px-4 text-sm font-semibold text-emerald transition hover:bg-emerald/10 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canExecute}
          onClick={onExecute}
          type="button"
        >
          <Play className="h-4 w-4" />
          {isExecuting ? "Executing..." : "Execute to dataset"}
        </button>

        {previewError ? (
          <Alert tone="error" message={previewError.message} />
        ) : null}
        {saveError ? <Alert tone="error" message={saveError.message} /> : null}
        {executeError ? (
          <Alert tone="error" message={executeError.message} />
        ) : null}
        {savedRecipeName ? (
          <Alert tone="success" message={`Saved ${savedRecipeName}`} />
        ) : null}
        {execution ? (
          <div className="space-y-3">
            <Alert
              tone="success"
              message={`Materialized ${execution.derived_dataset_name} (${execution.row_count} rows)`}
            />
            <Link
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
              to={`/datasets?project_id=${encodeURIComponent(dataset?.project_id ?? "")}&dataset_id=${encodeURIComponent(execution.derived_dataset_id)}`}
            >
              Open derived dataset
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StepEditor({
  index,
  step,
  fieldNames,
  onChange,
  onRemove,
}: {
  index: number;
  step: DraftStep;
  fieldNames: string[];
  onChange: (patch: Partial<DraftStep>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            Step {index + 1}: {operationLabel(step.operation)}
          </p>
          <p className="mt-1 text-xs text-muted">Order {index}</p>
        </div>
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white text-muted transition hover:border-red-300 hover:text-red-600"
          onClick={onRemove}
          title="Remove step"
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {step.operation === "rename_field" ? (
          <>
            <FieldSelect
              label="Source field"
              value={step.sourceField}
              fields={fieldNames}
              onChange={(sourceField) => onChange({ sourceField })}
            />
            <label className="block">
              <span className="text-xs font-semibold uppercase text-muted">
                Target field
              </span>
              <input
                className="mt-2 h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
                value={step.targetField}
                onChange={(event) =>
                  onChange({ targetField: event.target.value })
                }
              />
            </label>
          </>
        ) : null}

        {step.operation === "fill_null" ? (
          <>
            <FieldSelect
              label="Field"
              value={step.sourceField}
              fields={fieldNames}
              onChange={(sourceField) => onChange({ sourceField })}
            />
            <label className="block">
              <span className="text-xs font-semibold uppercase text-muted">
                Fill value
              </span>
              <input
                aria-label="Fill value"
                className="mt-2 h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
                value={step.value}
                onChange={(event) => onChange({ value: event.target.value })}
              />
            </label>
          </>
        ) : null}

        {step.operation === "drop_null_rows" ||
        step.operation === "deduplicate" ? (
          <fieldset className="md:col-span-2">
            <legend className="text-xs font-semibold uppercase text-muted">
              Fields
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {fieldNames.map((field) => {
                const checked = step.fields.includes(field);
                return (
                  <label
                    key={field}
                    className={[
                      "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                      checked
                        ? "border-brand bg-blue-50 text-brand"
                        : "border-line bg-white text-muted",
                    ].join(" ")}
                  >
                    <input
                      className="h-4 w-4 rounded border-line text-brand"
                      checked={checked}
                      type="checkbox"
                      onChange={(event) => {
                        onChange({
                          fields: event.target.checked
                            ? [...step.fields, field]
                            : step.fields.filter((item) => item !== field),
                        });
                      }}
                    />
                    {field}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
      </div>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  fields,
  onChange,
}: {
  label: string;
  value: string;
  fields: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-muted">
        {label}
      </span>
      <select
        className="mt-2 h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {fields.map((field) => (
          <option key={field} value={field}>
            {field}
          </option>
        ))}
      </select>
    </label>
  );
}

function PreviewPanel({
  dataset,
  preview,
  isLoading,
}: {
  dataset: Dataset | null;
  preview: CleaningPreview | null;
  isLoading: boolean;
}) {
  const fields = preview?.fields ?? [
    "_das_row_id",
    ...(dataset?.fields.map((field) => field.name) ?? []),
  ];
  const rows = preview?.rows ?? [];

  return (
    <div className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<Eraser className="h-4 w-4 text-brand" />}
        title="Preview result"
      />
      {isLoading ? (
        <StateMessage title="Preparing preview" />
      ) : !dataset ? (
        <StateMessage title="Select a dataset to preview cleaning output" />
      ) : !preview || rows.length === 0 ? (
        <StateMessage title="Run preview to inspect cleaned rows" />
      ) : (
        <>
          <div className="grid gap-3 border-b border-line p-4 md:grid-cols-3">
            <Metric
              label="Rows"
              value={preview.total_rows.toLocaleString()}
              tone="brand"
            />
            <Metric
              label="Fields"
              value={fields.length.toLocaleString()}
              tone="cyan"
            />
            <Metric
              label="Source"
              value={compactId(preview.source_dataset_id)}
              tone="emerald"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-muted">
                <tr>
                  {fields.map((field) => (
                    <th
                      key={field}
                      className="border-b border-line px-4 py-3 font-semibold"
                    >
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={`${row._das_row_id ?? rowIndex}`}
                    className="hover:bg-slate-50"
                  >
                    {fields.map((field) => (
                      <td
                        key={field}
                        className="border-b border-line px-4 py-3 text-ink"
                      >
                        {formatCell(row[field])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PanelHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
      {icon}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brand" | "cyan" | "emerald";
}) {
  const toneClass = {
    brand: "border-brand/20 bg-blue-50 text-brand",
    cyan: "border-cyan/20 bg-cyan/10 text-cyan",
    emerald: "border-emerald/20 bg-emerald/10 text-emerald",
  }[tone];

  return (
    <div className={`rounded-md border px-3 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function StateMessage({
  title,
  tone = "muted",
}: {
  title: string;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={[
        "m-4 rounded-md border px-4 py-6 text-center text-sm",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-line bg-slate-50 text-muted",
      ].join(" ")}
    >
      {title}
    </div>
  );
}

function Alert({
  tone,
  message,
}: {
  tone: "error" | "success";
  message: string;
}) {
  const className =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald/20 bg-emerald/10 text-emerald";

  return (
    <div className={`rounded-md border px-3 py-3 text-sm ${className}`}>
      {message}
    </div>
  );
}

function toStepPayloads(steps: DraftStep[]): CleaningStepPayload[] {
  return steps.map((step, index) => ({
    operation: step.operation,
    order: index,
    config: toStepConfig(step),
  }));
}

function toStepConfig(step: DraftStep): Record<string, unknown> {
  if (step.operation === "rename_field") {
    return { source_field: step.sourceField, target_field: step.targetField };
  }
  if (step.operation === "fill_null") {
    return { field: step.sourceField, value: step.value };
  }
  return { fields: step.fields };
}

function operationLabel(operation: CleaningOperation) {
  return (
    OPERATIONS.find((item) => item.operation === operation)?.label ?? operation
  );
}

function compactId(value: string) {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted">NULL</span>;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}
