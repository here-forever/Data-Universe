import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  FileUp,
  History,
  Pencil,
  RefreshCcw,
  RotateCcw,
  Search,
  Server,
  SquareCode,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listDatasets, type Dataset } from "../datasets/api";
import {
  listUploads,
  type UploadRecord,
  type UploadStatus,
} from "../imports/api";
import {
  archiveExternalDatabaseConnection,
  createExternalDatabaseConnection,
  getExternalImportDetail,
  importExternalSql,
  importExternalTable,
  inspectExternalDatabaseSchema,
  listExternalImportHistory,
  listExternalDatabaseConnections,
  previewExternalSql,
  previewExternalTable,
  restoreExternalDatabaseConnection,
  testExternalDatabaseConnection,
  updateExternalDatabaseConnection,
  type DatabaseType,
  type ExternalConnectionStatus,
  type ExternalDatabaseSchemaResponse,
  type ExternalDatabaseConnection,
  type ExternalDatabaseConnectionCreatePayload,
  type ExternalDatabaseConnectionUpdatePayload,
  type ExternalDatasetImportResponse,
  type ExternalImportDetailResponse,
  type ExternalImportHistoryItem,
  type ExternalImportPreviewResponse,
  type ExternalTable,
  type FieldType,
  type ImportFieldPreview,
} from "./api";

const DEFAULT_PROJECT_ID = "prj_demo";
const DEFAULT_DATABASE_PORTS: Record<DatabaseType, string> = {
  mysql: "3306",
  postgresql: "5432",
};

interface ExternalConnectionFormState {
  databaseName: string;
  databaseType: DatabaseType;
  host: string;
  name: string;
  password: string;
  port: string;
  username: string;
}

interface TableImportFormState {
  datasetName: string;
  limit: string;
  previewLimit: string;
}

interface SqlImportFormState {
  datasetName: string;
  limit: string;
  previewLimit: string;
  sql: string;
}

const DEFAULT_EXTERNAL_CONNECTION_FORM: ExternalConnectionFormState = {
  databaseName: "",
  databaseType: "postgresql",
  host: "",
  name: "",
  password: "",
  port: DEFAULT_DATABASE_PORTS.postgresql,
  username: "",
};

const DEFAULT_TABLE_IMPORT_FORM: TableImportFormState = {
  datasetName: "",
  limit: "1000",
  previewLimit: "100",
};

const DEFAULT_SQL_IMPORT_FORM: SqlImportFormState = {
  datasetName: "",
  limit: "1000",
  previewLimit: "100",
  sql: "SELECT * FROM orders",
};

const FIELD_TYPES: FieldType[] = [
  "text",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
];

export function DataSourcesPage() {
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(DEFAULT_PROJECT_ID);

  const uploadsQuery = useQuery({
    queryKey: ["import-uploads", submittedProjectId],
    queryFn: () => listUploads(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0,
  });

  const datasetsQuery = useQuery({
    queryKey: ["datasets", submittedProjectId],
    queryFn: () => listDatasets(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0,
  });

  const uploads = useMemo(
    () => uploadsQuery.data?.items ?? [],
    [uploadsQuery.data?.items],
  );
  const datasets = useMemo(
    () => datasetsQuery.data?.items ?? [],
    [datasetsQuery.data?.items],
  );
  const summary = useMemo(
    () => summarizeSourceState(uploads, datasets),
    [datasets, uploads],
  );

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedProjectId(projectId.trim());
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-line pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan">Data sources</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            Source intake center
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Manage local file access, inspect upload outcomes, and continue the
            path into formal datasets.
          </p>
        </div>

        <form className="flex w-full max-w-xl gap-2" onSubmit={submitProject}>
          <label className="sr-only" htmlFor="data-source-project-id">
            Project ID
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="data-source-project-id"
              className="h-10 w-full rounded-md border border-line bg-panel pl-9 pr-3 text-sm text-ink shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              placeholder="Project ID"
            />
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={projectId.trim().length === 0}
            type="submit"
          >
            <RefreshCcw className="h-4 w-4" />
            Load
          </button>
        </form>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric
          label="Uploads"
          value={summary.totalUploads.toLocaleString()}
          tone="brand"
        />
        <Metric
          label="Parsed"
          value={summary.parsedUploads.toLocaleString()}
          tone="emerald"
        />
        <Metric
          label="Failed"
          value={summary.failedUploads.toLocaleString()}
          tone="amber"
        />
        <Metric
          label="Datasets"
          value={summary.datasetCount.toLocaleString()}
          tone="cyan"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SourceTypePanel projectId={submittedProjectId} />

        <div className="space-y-5">
          <LocalFilePanel projectId={submittedProjectId} uploads={uploads} />
          <ExternalDatabasePanel projectId={submittedProjectId} />
          <UploadRecordPanel
            error={uploadsQuery.error}
            isLoading={uploadsQuery.isLoading || uploadsQuery.isFetching}
            uploads={uploads}
          />
          <DatasetBridgePanel
            datasets={datasets}
            error={datasetsQuery.error}
            isLoading={datasetsQuery.isLoading || datasetsQuery.isFetching}
          />
        </div>
      </div>
    </section>
  );
}

function SourceTypePanel({ projectId }: { projectId: string }) {
  const sourceTypes = [
    {
      title: "Local files",
      description:
        "CSV and Excel uploads with retained originals and preview recovery.",
      icon: FileSpreadsheet,
      tone: "brand" as const,
      state: "Available",
      href: `/import?project_id=${encodeURIComponent(projectId)}`,
    },
    {
      title: "External database",
      description:
        "PostgreSQL/MySQL read-only connections with saved metadata and test status.",
      icon: Server,
      tone: "emerald" as const,
      state: "MVP",
      href: null,
    },
    {
      title: "API source",
      description:
        "API ingestion is reserved until the core file and database paths are stable.",
      icon: SquareCode,
      tone: "amber" as const,
      state: "Reserved",
      href: null,
    },
  ];

  return (
    <aside className="space-y-3">
      {sourceTypes.map((sourceType) => {
        const Icon = sourceType.icon;

        return (
          <div
            key={sourceType.title}
            className="rounded-md border border-line bg-panel p-4 shadow-panel"
          >
            <div className="flex items-start gap-3">
              <div
                className={`rounded-md border p-2 ${toneClass(sourceType.tone)}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">
                    {sourceType.title}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-muted">
                    {sourceType.state}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {sourceType.description}
                </p>
                {sourceType.href ? (
                  <Link
                    className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-brand/20 bg-blue-50 px-3 text-xs font-semibold text-brand transition hover:bg-blue-100"
                    to={sourceType.href}
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    Open import
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

function LocalFilePanel({
  projectId,
  uploads,
}: {
  projectId: string;
  uploads: UploadRecord[];
}) {
  const latestUpload = uploads[0] ?? null;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader icon={FileUp} title="Local file intake" />
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-md border border-dashed border-cyan/30 bg-cyan/10 p-4">
          <p className="text-sm font-semibold text-ink">
            Upload CSV or Excel files
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Uploaded files are retained, parsed into recoverable previews, and
            materialized into formal PostgreSQL-backed datasets after
            confirmation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              to={`/import?project_id=${encodeURIComponent(projectId)}`}
            >
              <FileUp className="h-4 w-4" />
              Upload file
            </Link>
            {latestUpload?.preview_id ? (
              <Link
                className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald/30 bg-emerald/10 px-3 text-sm font-semibold text-emerald transition hover:bg-emerald/20"
                to={`/import?project_id=${encodeURIComponent(projectId)}&preview_id=${encodeURIComponent(latestUpload.preview_id)}`}
              >
                <History className="h-4 w-4" />
                Resume latest
              </Link>
            ) : null}
          </div>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-xs font-semibold uppercase text-muted">
            Latest upload
          </p>
          {latestUpload ? (
            <div className="mt-3 space-y-2">
              <p className="truncate text-sm font-semibold text-ink">
                {latestUpload.file_name}
              </p>
              <UploadStatusChip status={latestUpload.status} />
              <p className="text-xs text-muted">
                {formatDate(latestUpload.created_at)}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              No file uploads for this project yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ExternalDatabasePanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ExternalConnectionFormState>(
    DEFAULT_EXTERNAL_CONNECTION_FORM,
  );
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    null,
  );
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(
    null,
  );
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [tableImportForm, setTableImportForm] = useState<TableImportFormState>(
    DEFAULT_TABLE_IMPORT_FORM,
  );
  const [sqlImportForm, setSqlImportForm] = useState<SqlImportFormState>(
    DEFAULT_SQL_IMPORT_FORM,
  );
  const [tablePreview, setTablePreview] =
    useState<ExternalImportPreviewResponse | null>(null);
  const [sqlPreview, setSqlPreview] =
    useState<ExternalImportPreviewResponse | null>(null);
  const [tableFields, setTableFields] = useState<ImportFieldPreview[]>([]);
  const [sqlFields, setSqlFields] = useState<ImportFieldPreview[]>([]);
  const [activeImportTaskId, setActiveImportTaskId] = useState<string | null>(
    null,
  );

  const connectionsQuery = useQuery({
    queryKey: ["external-database-connections", projectId],
    queryFn: () => listExternalDatabaseConnections(projectId, true),
    enabled: projectId.trim().length > 0,
  });

  const createMutation = useMutation({
    mutationFn: (payload: ExternalDatabaseConnectionCreatePayload) =>
      createExternalDatabaseConnection(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["external-database-connections", projectId],
      });
      setForm((current) => ({
        ...DEFAULT_EXTERNAL_CONNECTION_FORM,
        databaseType: current.databaseType,
        port: DEFAULT_DATABASE_PORTS[current.databaseType],
      }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      connectionId,
      payload,
    }: {
      connectionId: string;
      payload: ExternalDatabaseConnectionUpdatePayload;
    }) => updateExternalDatabaseConnection(connectionId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["external-database-connections", projectId],
      });
      setEditingConnectionId(null);
      setForm(DEFAULT_EXTERNAL_CONNECTION_FORM);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (connectionId: string) =>
      archiveExternalDatabaseConnection(connectionId, projectId),
    onSuccess: (connection) => {
      void queryClient.invalidateQueries({
        queryKey: ["external-database-connections", projectId],
      });
      if (activeConnectionId === connection.id) {
        setActiveConnectionId(null);
      }
      if (editingConnectionId === connection.id) {
        cancelEditing();
      }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (connectionId: string) =>
      restoreExternalDatabaseConnection(connectionId, projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["external-database-connections", projectId],
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: testExternalDatabaseConnection,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["external-database-connections", projectId],
      });
    },
  });

  const schemaQuery = useQuery({
    queryKey: ["external-database-schema", activeConnectionId],
    queryFn: () => inspectExternalDatabaseSchema(activeConnectionId ?? ""),
    enabled: activeConnectionId !== null,
  });

  const importHistoryQuery = useQuery({
    queryKey: ["external-import-history", projectId],
    queryFn: () => listExternalImportHistory(projectId),
    enabled: projectId.trim().length > 0,
  });

  const importDetailQuery = useQuery({
    queryKey: ["external-import-detail", activeImportTaskId],
    queryFn: () => getExternalImportDetail(activeImportTaskId ?? ""),
    enabled: activeImportTaskId !== null,
  });

  const previewTableMutation = useMutation({
    mutationFn: ({
      connectionId,
      table,
    }: {
      connectionId: string;
      table: ExternalTable;
    }) =>
      previewExternalTable(connectionId, {
        limit: Number(tableImportForm.previewLimit),
        project_id: projectId,
        schema_name: table.schema_name,
        table_name: table.table_name,
      }),
    onSuccess: (preview) => {
      setTablePreview(preview);
      setTableFields(preview.fields);
      importTableMutation.reset();
    },
  });

  const previewSqlMutation = useMutation({
    mutationFn: (connectionId: string) =>
      previewExternalSql(connectionId, {
        limit: Number(sqlImportForm.previewLimit),
        project_id: projectId,
        sql: sqlImportForm.sql,
      }),
    onSuccess: (preview) => {
      setSqlPreview(preview);
      setSqlFields(preview.fields);
      importSqlMutation.reset();
    },
  });

  const importTableMutation = useMutation({
    mutationFn: ({
      connectionId,
      table,
    }: {
      connectionId: string;
      table: ExternalTable;
    }) =>
      importExternalTable(connectionId, {
        dataset_name: tableImportForm.datasetName.trim(),
        limit: Number(tableImportForm.limit),
        project_id: projectId,
        schema_name: table.schema_name,
        table_name: table.table_name,
        fields: tableFields,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["datasets", projectId] });
      setTableImportForm({
        datasetName: "",
        limit: tableImportForm.limit,
        previewLimit: tableImportForm.previewLimit,
      });
      return result;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["external-import-history", projectId],
      });
    },
  });

  const importSqlMutation = useMutation({
    mutationFn: (connectionId: string) =>
      importExternalSql(connectionId, {
        dataset_name: sqlImportForm.datasetName.trim(),
        limit: Number(sqlImportForm.limit),
        project_id: projectId,
        sql: sqlImportForm.sql,
        fields: sqlFields,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["datasets", projectId] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["external-import-history", projectId],
      });
    },
  });

  const connections = useMemo(
    () => connectionsQuery.data?.items ?? [],
    [connectionsQuery.data?.items],
  );
  const activeConnection = connections.find(
    (connection) =>
      connection.id === activeConnectionId && connection.archived_at == null,
  );
  const editingConnection = connections.find(
    (connection) => connection.id === editingConnectionId,
  );
  const selectedTable = useMemo(
    () =>
      schemaQuery.data?.tables.find(
        (table) => externalTableKey(table) === selectedTableKey,
      ) ?? null,
    [schemaQuery.data?.tables, selectedTableKey],
  );
  const portNumber = Number(form.port);
  const isValidPort =
    Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const canSave =
    projectId.trim().length > 0 &&
    form.name.trim().length > 0 &&
    form.host.trim().length > 0 &&
    form.databaseName.trim().length > 0 &&
    form.username.trim().length > 0 &&
    (editingConnectionId !== null || form.password.length > 0) &&
    isValidPort &&
    !createMutation.isPending &&
    !updateMutation.isPending;

  function updateField<K extends keyof ExternalConnectionFormState>(
    key: K,
    value: ExternalConnectionFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDatabaseType(databaseType: DatabaseType) {
    setForm((current) => ({
      ...current,
      databaseType,
      port: DEFAULT_DATABASE_PORTS[databaseType],
    }));
  }

  function inspectConnection(connectionId: string) {
    setActiveConnectionId(connectionId);
    setSelectedTableKey(null);
    setTableImportForm(DEFAULT_TABLE_IMPORT_FORM);
    setTablePreview(null);
    setSqlPreview(null);
    setTableFields([]);
    setSqlFields([]);
    importTableMutation.reset();
    importSqlMutation.reset();
    previewTableMutation.reset();
    previewSqlMutation.reset();
  }

  function startEditing(connection: ExternalDatabaseConnection) {
    setEditingConnectionId(connection.id);
    setForm({
      databaseName: connection.database_name,
      databaseType: connection.database_type,
      host: connection.host,
      name: connection.name,
      password: "",
      port: String(connection.port),
      username: connection.username,
    });
    createMutation.reset();
    updateMutation.reset();
  }

  function cancelEditing() {
    setEditingConnectionId(null);
    setForm(DEFAULT_EXTERNAL_CONNECTION_FORM);
    updateMutation.reset();
  }

  function selectTable(table: ExternalTable) {
    setSelectedTableKey(externalTableKey(table));
    setTablePreview(null);
    setTableFields([]);
    setTableImportForm((current) => ({
      ...current,
      datasetName:
        current.datasetName ||
        cleanDatasetNameFromExternalTable(table.table_name),
    }));
    previewTableMutation.reset();
    importTableMutation.reset();
  }

  function updateTableImportForm(next: TableImportFormState) {
    if (next.previewLimit !== tableImportForm.previewLimit) {
      setTablePreview(null);
      setTableFields([]);
      previewTableMutation.reset();
      importTableMutation.reset();
    }
    setTableImportForm(next);
  }

  function updateSqlImportForm(next: SqlImportFormState) {
    if (
      next.sql !== sqlImportForm.sql ||
      next.previewLimit !== sqlImportForm.previewLimit
    ) {
      setSqlPreview(null);
      setSqlFields([]);
      previewSqlMutation.reset();
      importSqlMutation.reset();
    }
    setSqlImportForm(next);
  }

  function submitConnection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    const payload = {
      database_name: form.databaseName.trim(),
      database_type: form.databaseType,
      host: form.host.trim(),
      name: form.name.trim(),
      port: portNumber,
      project_id: projectId.trim(),
      read_only: true,
      username: form.username.trim(),
    };
    if (editingConnectionId !== null) {
      updateMutation.mutate({
        connectionId: editingConnectionId,
        payload: {
          ...payload,
          ...(form.password.length > 0 ? { password: form.password } : {}),
        },
      });
      return;
    }

    updateMutation.reset();
    createMutation.mutate({ ...payload, password: form.password });
  }

  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader icon={Server} title="External database connections" />
      <div className="grid gap-4 p-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <form
          className="space-y-4 rounded-md border border-lilac/20 bg-lilac/10 p-4"
          onSubmit={submitConnection}
        >
          <div>
            <p className="text-sm font-semibold text-ink">
              {editingConnection
                ? "Edit connection"
                : "Save read-only connection"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {editingConnection
                ? "Update endpoint metadata or enter a new password to rotate the stored credential."
                : "Store encrypted connection metadata, then verify the database can answer a read-only test query."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(["postgresql", "mysql"] as const).map((databaseType) => (
              <button
                key={databaseType}
                className={[
                  "h-9 rounded-md border px-3 text-xs font-semibold transition",
                  form.databaseType === databaseType
                    ? "border-lilac bg-lilac text-white shadow-sm"
                    : "border-lilac/20 bg-white text-lilac hover:bg-lilac/10",
                ].join(" ")}
                onClick={() => updateDatabaseType(databaseType)}
                type="button"
              >
                {databaseType === "postgresql" ? "PostgreSQL" : "MySQL"}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-1">
            <TextInput
              id="external-connection-name"
              label="Connection name"
              placeholder="Warehouse readonly"
              value={form.name}
              onChange={(value) => updateField("name", value)}
            />
            <TextInput
              id="external-connection-host"
              label="Host"
              placeholder="127.0.0.1"
              value={form.host}
              onChange={(value) => updateField("host", value)}
            />
            <TextInput
              id="external-connection-port"
              label="Port"
              placeholder={DEFAULT_DATABASE_PORTS[form.databaseType]}
              value={form.port}
              onChange={(value) => updateField("port", value)}
            />
            <TextInput
              id="external-connection-database"
              label="Database"
              placeholder="analytics"
              value={form.databaseName}
              onChange={(value) => updateField("databaseName", value)}
            />
            <TextInput
              id="external-connection-username"
              label="Username"
              placeholder="readonly_user"
              value={form.username}
              onChange={(value) => updateField("username", value)}
            />
            <TextInput
              id="external-connection-password"
              label="Password"
              placeholder={
                editingConnection
                  ? "Leave blank to keep current password"
                  : "Encrypted before storage"
              }
              type="password"
              value={form.password}
              onChange={(value) => updateField("password", value)}
            />
          </div>

          <label className="flex items-start gap-2 rounded-md border border-mint/20 bg-white px-3 py-2 text-xs leading-5 text-muted">
            <input
              checked
              className="mt-0.5 h-4 w-4 rounded border-line text-mint"
              readOnly
              type="checkbox"
            />
            Read-only connection policy is enforced for this MVP.
          </label>

          {!isValidPort ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Port must be an integer between 1 and 65535.
            </p>
          ) : null}

          <button
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSave}
            type="submit"
          >
            <Database className="h-4 w-4" />
            {createMutation.isPending || updateMutation.isPending
              ? "Saving..."
              : editingConnection
                ? "Update connection"
                : "Save connection"}
          </button>

          {editingConnection ? (
            <button
              className="h-9 w-full rounded-md border border-line bg-white px-3 text-xs font-semibold text-muted transition hover:bg-slate-50 hover:text-ink"
              onClick={cancelEditing}
              type="button"
            >
              Cancel editing
            </button>
          ) : null}

          {createMutation.data ? (
            <Alert
              message={`Saved ${createMutation.data.name}. Run a connection test before importing tables.`}
              tone="success"
            />
          ) : null}
          {createMutation.error ? (
            <Alert message={createMutation.error.message} tone="error" />
          ) : null}
          {updateMutation.data ? (
            <Alert
              message={`Updated ${updateMutation.data.name}. Test it before the next import.`}
              tone="success"
            />
          ) : null}
          {updateMutation.error ? (
            <Alert message={updateMutation.error.message} tone="error" />
          ) : null}
        </form>

        <ExternalConnectionList
          connections={connections}
          error={connectionsQuery.error}
          isLoading={connectionsQuery.isLoading || connectionsQuery.isFetching}
          testError={testMutation.error}
          testResult={testMutation.data}
          actionError={archiveMutation.error ?? restoreMutation.error}
          archivingConnectionId={
            archiveMutation.isPending ? archiveMutation.variables : undefined
          }
          restoringConnectionId={
            restoreMutation.isPending ? restoreMutation.variables : undefined
          }
          testingConnectionId={
            testMutation.isPending ? testMutation.variables : undefined
          }
          onTest={(connectionId) => testMutation.mutate(connectionId)}
          onInspect={inspectConnection}
          onArchive={(connectionId) => archiveMutation.mutate(connectionId)}
          onEdit={startEditing}
          onRestore={(connectionId) => restoreMutation.mutate(connectionId)}
        />
      </div>
      <ExternalImportWorkspace
        activeConnection={activeConnection ?? null}
        importHistory={importHistoryQuery.data?.items ?? []}
        importHistoryError={importHistoryQuery.error}
        importDetail={importDetailQuery.data}
        importDetailError={importDetailQuery.error}
        isLoadingImportDetail={
          importDetailQuery.isLoading || importDetailQuery.isFetching
        }
        isLoadingImportHistory={
          importHistoryQuery.isLoading || importHistoryQuery.isFetching
        }
        importSqlError={importSqlMutation.error}
        importSqlResult={importSqlMutation.data}
        importTableError={importTableMutation.error}
        importTableResult={importTableMutation.data}
        isImportingSql={importSqlMutation.isPending}
        isImportingTable={importTableMutation.isPending}
        isLoadingSchema={schemaQuery.isLoading || schemaQuery.isFetching}
        isPreviewingSql={previewSqlMutation.isPending}
        isPreviewingTable={previewTableMutation.isPending}
        previewSqlError={previewSqlMutation.error}
        previewTableError={previewTableMutation.error}
        schema={schemaQuery.data}
        schemaError={schemaQuery.error}
        selectedTable={selectedTable}
        sqlFields={sqlFields}
        sqlImportForm={sqlImportForm}
        sqlPreview={sqlPreview}
        tableFields={tableFields}
        tableImportForm={tableImportForm}
        tablePreview={tablePreview}
        onImportSql={(connectionId) => importSqlMutation.mutate(connectionId)}
        onImportTable={(connectionId, table) =>
          importTableMutation.mutate({ connectionId, table })
        }
        onInspectImport={setActiveImportTaskId}
        onPreviewSql={(connectionId) => previewSqlMutation.mutate(connectionId)}
        onPreviewTable={(connectionId, table) =>
          previewTableMutation.mutate({ connectionId, table })
        }
        onSelectTable={selectTable}
        onUpdateSqlFields={setSqlFields}
        onUpdateSqlImportForm={updateSqlImportForm}
        onUpdateTableFields={setTableFields}
        onUpdateTableImportForm={updateTableImportForm}
      />
    </div>
  );
}

function ExternalConnectionList({
  connections,
  isLoading,
  error,
  actionError,
  archivingConnectionId,
  restoringConnectionId,
  testingConnectionId,
  testResult,
  testError,
  onTest,
  onInspect,
  onArchive,
  onEdit,
  onRestore,
}: {
  connections: ExternalDatabaseConnection[];
  isLoading: boolean;
  error: Error | null;
  actionError: Error | null;
  archivingConnectionId?: string;
  restoringConnectionId?: string;
  testingConnectionId?: string;
  testResult?: { ok: boolean; message: string };
  testError: Error | null;
  onTest: (connectionId: string) => void;
  onInspect: (connectionId: string) => void;
  onArchive: (connectionId: string) => void;
  onEdit: (connection: ExternalDatabaseConnection) => void;
  onRestore: (connectionId: string) => void;
}) {
  const activeCount = connections.filter(
    (connection) => connection.archived_at == null,
  ).length;
  return (
    <div className="min-w-0 rounded-md border border-line bg-white">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">Saved connections</p>
          <p className="mt-1 text-xs text-muted">
            PostgreSQL/MySQL entries are project-scoped and password-free in
            responses.
          </p>
        </div>
        <span className="w-fit rounded-full bg-cyan/10 px-2.5 py-1 text-xs font-semibold text-cyan">
          {activeCount.toLocaleString()} active /{" "}
          {connections.length.toLocaleString()} total
        </span>
      </div>

      {testResult ? (
        <div
          className={[
            "border-b border-line px-4 py-3 text-sm",
            testResult.ok
              ? "bg-emerald/10 text-emerald"
              : "bg-red-50 text-red-700",
          ].join(" ")}
        >
          {testResult.message}
        </div>
      ) : null}
      {testError ? (
        <div className="border-b border-line bg-red-50 px-4 py-3 text-sm text-red-700">
          {testError.message}
        </div>
      ) : null}
      {actionError ? (
        <div className="border-b border-line bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError.message}
        </div>
      ) : null}

      {isLoading ? (
        <StateMessage title="Loading external database connections" />
      ) : error ? (
        <StateMessage
          title="Could not load database connections"
          tone="error"
        />
      ) : connections.length === 0 ? (
        <StateMessage title="No external database connections yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Connection
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Endpoint
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Status
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Updated
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection) => (
                <ExternalConnectionRow
                  key={connection.id}
                  connection={connection}
                  isArchiving={archivingConnectionId === connection.id}
                  isRestoring={restoringConnectionId === connection.id}
                  isTesting={testingConnectionId === connection.id}
                  onArchive={onArchive}
                  onEdit={onEdit}
                  onInspect={onInspect}
                  onRestore={onRestore}
                  onTest={onTest}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExternalConnectionRow({
  connection,
  isArchiving,
  isRestoring,
  isTesting,
  onArchive,
  onEdit,
  onInspect,
  onRestore,
  onTest,
}: {
  connection: ExternalDatabaseConnection;
  isArchiving: boolean;
  isRestoring: boolean;
  isTesting: boolean;
  onArchive: (connectionId: string) => void;
  onEdit: (connection: ExternalDatabaseConnection) => void;
  onInspect: (connectionId: string) => void;
  onRestore: (connectionId: string) => void;
  onTest: (connectionId: string) => void;
}) {
  const isArchived = connection.archived_at != null;
  return (
    <tr
      className={
        isArchived ? "align-top bg-slate-50/80" : "align-top hover:bg-slate-50"
      }
    >
      <td className="border-b border-line px-4 py-3">
        <p className="max-w-xs truncate font-semibold text-ink">
          {connection.name}
        </p>
        <p className="mt-1 font-mono text-xs text-muted">{connection.id}</p>
        <p className="mt-2 text-xs uppercase text-muted">
          {connection.database_type === "postgresql" ? "PostgreSQL" : "MySQL"}{" "}
          readonly
        </p>
      </td>
      <td className="border-b border-line px-4 py-3">
        <p className="max-w-sm truncate font-mono text-xs text-ink">
          {connection.host}:{connection.port}/{connection.database_name}
        </p>
        <p className="mt-1 text-xs text-muted">{connection.username}</p>
      </td>
      <td className="border-b border-line px-4 py-3">
        {isArchived ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-slate-100 px-2.5 py-1 text-xs font-semibold text-muted">
            <Archive className="h-3.5 w-3.5" />
            Archived
          </span>
        ) : (
          <ExternalConnectionStatusChip status={connection.status} />
        )}
        {!isArchived && connection.last_error ? (
          <p className="mt-2 max-w-sm rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            {connection.last_error}
          </p>
        ) : null}
      </td>
      <td className="border-b border-line px-4 py-3 text-xs text-muted">
        {formatDate(connection.updated_at)}
      </td>
      <td className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {isArchived ? (
            <button
              className="inline-flex h-8 items-center gap-2 rounded-md border border-cyan/20 bg-cyan/10 px-3 text-xs font-semibold text-cyan transition hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRestoring}
              onClick={() => onRestore(connection.id)}
              type="button"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {isRestoring ? "Restoring" : "Restore"}
            </button>
          ) : (
            <>
              <button
                className="inline-flex h-8 items-center gap-2 rounded-md border border-emerald/30 bg-emerald/10 px-3 text-xs font-semibold text-emerald transition hover:bg-emerald/20 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isTesting}
                onClick={() => onTest(connection.id)}
                type="button"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                {isTesting ? "Testing" : "Test"}
              </button>
              <button
                className="inline-flex h-8 items-center gap-2 rounded-md border border-brand/20 bg-blue-50 px-3 text-xs font-semibold text-brand transition hover:bg-blue-100"
                onClick={() => onInspect(connection.id)}
                type="button"
              >
                <Database className="h-3.5 w-3.5" />
                Discover
              </button>
              <button
                className="inline-flex h-8 items-center gap-2 rounded-md border border-rose/20 bg-rose/10 px-3 text-xs font-semibold text-rose transition hover:bg-rose/20"
                onClick={() => onEdit(connection)}
                type="button"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-muted transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isArchiving}
                onClick={() => onArchive(connection.id)}
                type="button"
              >
                <Archive className="h-3.5 w-3.5" />
                {isArchiving ? "Archiving" : "Archive"}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function ExternalImportWorkspace({
  activeConnection,
  importHistory,
  importHistoryError,
  importDetail,
  importDetailError,
  isLoadingImportDetail,
  isLoadingImportHistory,
  schema,
  isLoadingSchema,
  schemaError,
  selectedTable,
  tableImportForm,
  sqlImportForm,
  tablePreview,
  sqlPreview,
  tableFields,
  sqlFields,
  importTableResult,
  importSqlResult,
  previewTableError,
  previewSqlError,
  importTableError,
  importSqlError,
  isPreviewingTable,
  isPreviewingSql,
  isImportingTable,
  isImportingSql,
  onSelectTable,
  onPreviewTable,
  onPreviewSql,
  onImportTable,
  onImportSql,
  onUpdateTableFields,
  onUpdateSqlFields,
  onUpdateTableImportForm,
  onUpdateSqlImportForm,
  onInspectImport,
}: {
  activeConnection: ExternalDatabaseConnection | null;
  importHistory: ExternalImportHistoryItem[];
  importHistoryError: Error | null;
  importDetail?: ExternalImportDetailResponse;
  importDetailError: Error | null;
  isLoadingImportDetail: boolean;
  isLoadingImportHistory: boolean;
  schema?: ExternalDatabaseSchemaResponse;
  isLoadingSchema: boolean;
  schemaError: Error | null;
  selectedTable: ExternalTable | null;
  tableImportForm: TableImportFormState;
  sqlImportForm: SqlImportFormState;
  tablePreview: ExternalImportPreviewResponse | null;
  sqlPreview: ExternalImportPreviewResponse | null;
  tableFields: ImportFieldPreview[];
  sqlFields: ImportFieldPreview[];
  importTableResult?: ExternalDatasetImportResponse;
  importSqlResult?: ExternalDatasetImportResponse;
  previewTableError: Error | null;
  previewSqlError: Error | null;
  importTableError: Error | null;
  importSqlError: Error | null;
  isPreviewingTable: boolean;
  isPreviewingSql: boolean;
  isImportingTable: boolean;
  isImportingSql: boolean;
  onSelectTable: (table: ExternalTable) => void;
  onPreviewTable: (connectionId: string, table: ExternalTable) => void;
  onPreviewSql: (connectionId: string) => void;
  onImportTable: (connectionId: string, table: ExternalTable) => void;
  onImportSql: (connectionId: string) => void;
  onUpdateTableFields: (fields: ImportFieldPreview[]) => void;
  onUpdateSqlFields: (fields: ImportFieldPreview[]) => void;
  onUpdateTableImportForm: (form: TableImportFormState) => void;
  onUpdateSqlImportForm: (form: SqlImportFormState) => void;
  onInspectImport: (taskId: string) => void;
}) {
  const tableLimit = Number(tableImportForm.limit);
  const tablePreviewLimit = Number(tableImportForm.previewLimit);
  const sqlLimit = Number(sqlImportForm.limit);
  const sqlPreviewLimit = Number(sqlImportForm.previewLimit);
  const canImportTable =
    activeConnection !== null &&
    selectedTable !== null &&
    tablePreview !== null &&
    tableFields.length > 0 &&
    tableFields.every((field) => field.name.trim().length > 0) &&
    tableImportForm.datasetName.trim().length > 0 &&
    Number.isInteger(tableLimit) &&
    tableLimit >= 1 &&
    tableLimit <= 10000 &&
    !isImportingTable;
  const canPreviewTable =
    activeConnection !== null &&
    selectedTable !== null &&
    Number.isInteger(tablePreviewLimit) &&
    tablePreviewLimit >= 1 &&
    tablePreviewLimit <= 10000 &&
    !isPreviewingTable;
  const canImportSql =
    activeConnection !== null &&
    sqlPreview !== null &&
    sqlFields.length > 0 &&
    sqlFields.every((field) => field.name.trim().length > 0) &&
    sqlImportForm.datasetName.trim().length > 0 &&
    sqlImportForm.sql.trim().length > 0 &&
    Number.isInteger(sqlLimit) &&
    sqlLimit >= 1 &&
    sqlLimit <= 10000 &&
    !isImportingSql;
  const canPreviewSql =
    activeConnection !== null &&
    sqlImportForm.sql.trim().length > 0 &&
    Number.isInteger(sqlPreviewLimit) &&
    sqlPreviewLimit >= 1 &&
    sqlPreviewLimit <= 10000 &&
    !isPreviewingSql;

  return (
    <div className="border-t border-line bg-slate-50/70 p-4">
      {!activeConnection ? (
        <StateMessage title="Choose Discover on a saved connection to inspect external tables" />
      ) : (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="overflow-hidden rounded-md border border-line bg-white">
            <div className="flex flex-col gap-2 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Schema discovery
                </p>
                <p className="mt-1 text-xs text-muted">
                  {activeConnection.name} / {activeConnection.database_name}
                </p>
              </div>
              <span className="w-fit rounded-full bg-emerald/10 px-2.5 py-1 text-xs font-semibold text-emerald">
                {schema?.tables.length.toLocaleString() ?? "0"} tables
              </span>
            </div>

            {isLoadingSchema ? (
              <StateMessage title="Inspecting external schema" />
            ) : schemaError ? (
              <StateMessage title={schemaError.message} tone="error" />
            ) : !schema || schema.tables.length === 0 ? (
              <StateMessage title="No external tables discovered" />
            ) : (
              <div className="grid gap-3 p-4 lg:grid-cols-2">
                {schema.tables.map((table) => {
                  const isSelected =
                    selectedTable !== null &&
                    externalTableKey(selectedTable) === externalTableKey(table);

                  return (
                    <button
                      key={externalTableKey(table)}
                      className={[
                        "rounded-md border p-4 text-left transition",
                        isSelected
                          ? "border-brand bg-blue-50"
                          : "border-line bg-white hover:border-brand hover:bg-blue-50",
                      ].join(" ")}
                      onClick={() => onSelectTable(table)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {qualifiedTableName(table)}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {table.columns.length.toLocaleString()} fields
                          </p>
                        </div>
                        <span className="rounded bg-cyan/10 px-2 py-1 text-xs font-semibold text-cyan">
                          table
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {table.columns.slice(0, 5).map((column) => (
                          <span
                            key={`${externalTableKey(table)}-${column.name}`}
                            className="rounded-full border border-line bg-slate-50 px-2 py-1 text-[11px] text-muted"
                          >
                            {column.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-line bg-white p-4">
              <p className="text-sm font-semibold text-ink">
                Preview and import selected table
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Inspect a bounded sample, adjust fields, then materialize the
                selected table into a formal dataset.
              </p>
              {selectedTable ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-md border border-cyan/20 bg-cyan/10 px-3 py-2 text-xs text-cyan">
                    {qualifiedTableName(selectedTable)} /{" "}
                    {selectedTable.columns.length} fields
                  </div>
                  <TextInput
                    id="external-table-dataset-name"
                    label="Dataset name"
                    placeholder="External Orders"
                    value={tableImportForm.datasetName}
                    onChange={(value) =>
                      onUpdateTableImportForm({
                        ...tableImportForm,
                        datasetName: value,
                      })
                    }
                  />
                  <TextInput
                    id="external-table-preview-limit"
                    label="Preview rows"
                    placeholder="100"
                    value={tableImportForm.previewLimit}
                    onChange={(value) =>
                      onUpdateTableImportForm({
                        ...tableImportForm,
                        previewLimit: value,
                      })
                    }
                  />
                  <TextInput
                    id="external-table-limit"
                    label="Import row limit"
                    placeholder="1000"
                    value={tableImportForm.limit}
                    onChange={(value) =>
                      onUpdateTableImportForm({
                        ...tableImportForm,
                        limit: value,
                      })
                    }
                  />
                  <button
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-brand/20 bg-blue-50 px-4 text-sm font-semibold text-brand shadow-sm transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!canPreviewTable}
                    onClick={() => {
                      if (activeConnection && selectedTable) {
                        onPreviewTable(activeConnection.id, selectedTable);
                      }
                    }}
                    type="button"
                  >
                    <Database className="h-4 w-4" />
                    {isPreviewingTable ? "Previewing..." : "Preview table"}
                  </button>
                  <ExternalPreviewEditor
                    fields={tableFields}
                    preview={tablePreview}
                    onUpdateFields={onUpdateTableFields}
                  />
                  <button
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!canImportTable}
                    onClick={() => {
                      if (activeConnection && selectedTable) {
                        onImportTable(activeConnection.id, selectedTable);
                      }
                    }}
                    type="button"
                  >
                    <Database className="h-4 w-4" />
                    {isImportingTable ? "Importing..." : "Confirm import"}
                  </button>
                  <ImportResultAlert result={importTableResult} />
                  {previewTableError ? (
                    <Alert message={previewTableError.message} tone="error" />
                  ) : null}
                  {importTableError ? (
                    <Alert message={importTableError.message} tone="error" />
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">
                  Select a discovered table to configure dataset import.
                </p>
              )}
            </div>

            <div className="rounded-md border border-amber/20 bg-amber/10 p-4">
              <p className="text-sm font-semibold text-ink">
                Advanced SQL import
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Save a read-only query result as a formal dataset.
              </p>
              <div className="mt-4 space-y-3">
                <TextInput
                  id="external-sql-dataset-name"
                  label="Dataset name"
                  placeholder="Filtered Orders"
                  value={sqlImportForm.datasetName}
                  onChange={(value) =>
                    onUpdateSqlImportForm({
                      ...sqlImportForm,
                      datasetName: value,
                    })
                  }
                />
                <TextInput
                  id="external-sql-preview-limit"
                  label="Preview rows"
                  placeholder="100"
                  value={sqlImportForm.previewLimit}
                  onChange={(value) =>
                    onUpdateSqlImportForm({
                      ...sqlImportForm,
                      previewLimit: value,
                    })
                  }
                />
                <TextInput
                  id="external-sql-limit"
                  label="Import row limit"
                  placeholder="1000"
                  value={sqlImportForm.limit}
                  onChange={(value) =>
                    onUpdateSqlImportForm({
                      ...sqlImportForm,
                      limit: value,
                    })
                  }
                />
                <label className="block" htmlFor="external-sql-query">
                  <span className="text-xs font-semibold uppercase text-muted">
                    SQL
                  </span>
                  <textarea
                    id="external-sql-query"
                    className="mt-2 min-h-28 w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
                    value={sqlImportForm.sql}
                    onChange={(event) =>
                      onUpdateSqlImportForm({
                        ...sqlImportForm,
                        sql: event.target.value,
                      })
                    }
                  />
                </label>
                <button
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-amber/30 bg-white px-4 text-sm font-semibold text-amber shadow-sm transition hover:bg-amber/10 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!canPreviewSql}
                  onClick={() => {
                    if (activeConnection) {
                      onPreviewSql(activeConnection.id);
                    }
                  }}
                  type="button"
                >
                  <Database className="h-4 w-4" />
                  {isPreviewingSql ? "Previewing..." : "Preview SQL result"}
                </button>
                <ExternalPreviewEditor
                  fields={sqlFields}
                  preview={sqlPreview}
                  onUpdateFields={onUpdateSqlFields}
                />
                <button
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-amber px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!canImportSql}
                  onClick={() => {
                    if (activeConnection) {
                      onImportSql(activeConnection.id);
                    }
                  }}
                  type="button"
                >
                  <Database className="h-4 w-4" />
                  {isImportingSql ? "Importing..." : "Confirm SQL import"}
                </button>
                <ImportResultAlert result={importSqlResult} />
                {previewSqlError ? (
                  <Alert message={previewSqlError.message} tone="error" />
                ) : null}
                {importSqlError ? (
                  <Alert message={importSqlError.message} tone="error" />
                ) : null}
              </div>
            </div>
          </div>
          <ExternalImportHistoryPanel
            detail={importDetail}
            detailError={importDetailError}
            history={importHistory}
            historyError={importHistoryError}
            isLoadingDetail={isLoadingImportDetail}
            isLoadingHistory={isLoadingImportHistory}
            onInspect={onInspectImport}
          />
        </div>
      )}
    </div>
  );
}

function ExternalPreviewEditor({
  preview,
  fields,
  onUpdateFields,
}: {
  preview: ExternalImportPreviewResponse | null;
  fields: ImportFieldPreview[];
  onUpdateFields: (fields: ImportFieldPreview[]) => void;
}) {
  if (!preview) {
    return (
      <div className="rounded-md border border-dashed border-line bg-slate-50 px-3 py-4 text-sm text-muted">
        Preview data before confirming the import.
      </div>
    );
  }

  function updateField(index: number, patch: Partial<ImportFieldPreview>) {
    onUpdateFields(
      fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-muted">
          Preview result
        </p>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-muted">
          {preview.row_count.toLocaleString()} rows sampled
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
          <thead className="bg-slate-50 text-muted">
            <tr>
              <th className="border-b border-line px-2 py-2 font-semibold">
                Field
              </th>
              <th className="border-b border-line px-2 py-2 font-semibold">
                Type
              </th>
              <th className="border-b border-line px-2 py-2 font-semibold">
                Null
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <tr key={`${field.order}-${index}`}>
                <td className="border-b border-line px-2 py-2">
                  <input
                    aria-label={`Field name ${field.order + 1}`}
                    className="h-8 w-full min-w-28 rounded-md border border-line bg-white px-2 text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
                    value={field.name}
                    onChange={(event) =>
                      updateField(index, { name: event.target.value })
                    }
                  />
                </td>
                <td className="border-b border-line px-2 py-2">
                  <select
                    aria-label={`Field type ${field.order + 1}`}
                    className="h-8 w-full min-w-24 rounded-md border border-line bg-white px-2 text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
                    value={field.inferred_type}
                    onChange={(event) =>
                      updateField(index, {
                        inferred_type: event.target.value as FieldType,
                      })
                    }
                  >
                    {FIELD_TYPES.map((fieldType) => (
                      <option key={fieldType} value={fieldType}>
                        {fieldType}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border-b border-line px-2 py-2">
                  <input
                    aria-label={`Nullable ${field.order + 1}`}
                    checked={field.nullable}
                    className="h-4 w-4 rounded border-line text-brand"
                    type="checkbox"
                    onChange={(event) =>
                      updateField(index, { nullable: event.target.checked })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
          <thead className="bg-slate-50 text-muted">
            <tr>
              {fields.slice(0, 5).map((field) => (
                <th
                  key={`sample-${field.order}`}
                  className="border-b border-line px-2 py-2 font-semibold"
                >
                  {field.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.sample_rows.slice(0, 3).map((row, rowIndex) => (
              <tr key={`preview-row-${rowIndex}`}>
                {preview.fields.slice(0, 5).map((sourceField) => (
                  <td
                    key={`${rowIndex}-${sourceField.order}`}
                    className="max-w-36 truncate border-b border-line px-2 py-2 text-muted"
                  >
                    {formatCell(row[sourceField.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExternalImportHistoryPanel({
  history,
  historyError,
  detail,
  detailError,
  isLoadingHistory,
  isLoadingDetail,
  onInspect,
}: {
  history: ExternalImportHistoryItem[];
  historyError: Error | null;
  detail?: ExternalImportDetailResponse;
  detailError: Error | null;
  isLoadingHistory: boolean;
  isLoadingDetail: boolean;
  onInspect: (taskId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-white">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">
            External import history
          </p>
          <p className="mt-1 text-xs text-muted">
            Table and SQL imports are recorded through Task Center.
          </p>
        </div>
        <span className="w-fit rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand">
          {history.length.toLocaleString()} imports
        </span>
      </div>
      {isLoadingHistory ? (
        <StateMessage title="Loading external import history" />
      ) : historyError ? (
        <StateMessage title={historyError.message} tone="error" />
      ) : history.length === 0 ? (
        <StateMessage title="No external imports recorded yet" />
      ) : (
        <div className="divide-y divide-line">
          {history.slice(0, 6).map((item) => (
            <div key={item.task.id} className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-muted">
                      {item.source_type === "external_table" ? "table" : "SQL"}
                    </span>
                    <TaskStatusChip status={item.task.status} />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-ink">
                    {item.dataset_name ?? item.task.name}
                  </p>
                  <p className="mt-1 max-w-xl truncate font-mono text-xs text-muted">
                    {item.source_type === "external_table"
                      ? qualifiedExternalImportName(item)
                      : item.sql}
                  </p>
                  {item.task.error_message ? (
                    <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                      {item.task.error_message}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex h-8 items-center rounded-md border border-line bg-slate-50 px-3 text-xs font-semibold text-muted transition hover:bg-slate-100"
                    onClick={() => onInspect(item.task.id)}
                    type="button"
                  >
                    Detail
                  </button>
                  <Link
                    className="inline-flex h-8 items-center rounded-md border border-brand/20 bg-blue-50 px-3 text-xs font-semibold text-brand transition hover:bg-blue-100"
                    to={`/tasks?project_id=${encodeURIComponent(item.task.project_id ?? "")}`}
                  >
                    Task trace
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {isLoadingDetail ? (
        <StateMessage title="Loading import detail" />
      ) : detailError ? (
        <StateMessage title={detailError.message} tone="error" />
      ) : detail ? (
        <div className="border-t border-line bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase text-muted">
            Selected import detail
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">
            {detail.item.dataset_name ?? detail.item.task.name}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {detail.fields.map((field) => (
              <span
                key={`${detail.item.task.id}-${field.order}`}
                className="rounded-full border border-line bg-white px-2 py-1 text-[11px] text-muted"
              >
                {field.name}:{field.inferred_type}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UploadRecordPanel({
  uploads,
  isLoading,
  error,
}: {
  uploads: UploadRecord[];
  isLoading: boolean;
  error: Error | null;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader icon={History} title="Recent upload records" />
      {isLoading ? (
        <StateMessage title="Loading upload records" />
      ) : error ? (
        <StateMessage title="Could not load upload records" tone="error" />
      ) : uploads.length === 0 ? (
        <StateMessage title="No upload records found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  File
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Status
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Rows
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Updated
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {uploads.slice(0, 6).map((upload) => (
                <tr key={upload.id} className="align-top hover:bg-slate-50">
                  <td className="border-b border-line px-4 py-3">
                    <p className="max-w-xs truncate font-semibold text-ink">
                      {upload.file_name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {upload.id}
                    </p>
                    {upload.error_message ? (
                      <p className="mt-2 max-w-md rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                        {upload.error_message}
                      </p>
                    ) : null}
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <UploadStatusChip status={upload.status} />
                  </td>
                  <td className="border-b border-line px-4 py-3 text-muted">
                    {upload.preview_row_count?.toLocaleString() ?? "-"}
                  </td>
                  <td className="border-b border-line px-4 py-3 text-xs text-muted">
                    {formatDate(upload.updated_at)}
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {upload.preview_id ? (
                        <Link
                          className="inline-flex h-8 items-center rounded-md border border-emerald/30 bg-emerald/10 px-3 text-xs font-semibold text-emerald transition hover:bg-emerald/20"
                          to={`/import?project_id=${encodeURIComponent(upload.project_id)}&preview_id=${encodeURIComponent(upload.preview_id)}`}
                        >
                          Open preview
                        </Link>
                      ) : null}
                      <Link
                        className="inline-flex h-8 items-center rounded-md border border-brand/20 bg-blue-50 px-3 text-xs font-semibold text-brand transition hover:bg-blue-100"
                        to={`/tasks?project_id=${encodeURIComponent(upload.project_id)}`}
                      >
                        Task trace
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DatasetBridgePanel({
  datasets,
  isLoading,
  error,
}: {
  datasets: Dataset[];
  isLoading: boolean;
  error: Error | null;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={Database}
        title="Formal datasets created from sources"
      />
      {isLoading ? (
        <StateMessage title="Loading datasets" />
      ) : error ? (
        <StateMessage title="Could not load datasets" tone="error" />
      ) : datasets.length === 0 ? (
        <StateMessage title="No formal datasets created yet" />
      ) : (
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {datasets.slice(0, 4).map((dataset) => (
            <Link
              key={dataset.id}
              className="rounded-md border border-line bg-white p-4 transition hover:border-brand hover:bg-blue-50"
              to={`/datasets?project_id=${encodeURIComponent(dataset.project_id)}&dataset_id=${encodeURIComponent(dataset.id)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {dataset.name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {dataset.physical_table_name}
                  </p>
                </div>
                <span className="rounded bg-emerald/10 px-2 py-1 text-xs font-semibold text-emerald">
                  {dataset.row_count.toLocaleString()}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted">
                {dataset.fields.length.toLocaleString()} fields /{" "}
                {dataset.source_preview_id
                  ? `preview ${compactId(dataset.source_preview_id)}`
                  : "materialized source"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
}: {
  icon: typeof FileSpreadsheet;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
      <Icon className="h-4 w-4 text-brand" />
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
    </div>
  );
}

function UploadStatusChip({ status }: { status: UploadStatus }) {
  const meta = {
    failed: {
      label: "Failed",
      icon: AlertTriangle,
      className: "border-red-200 bg-red-50 text-red-700",
    },
    parsed: {
      label: "Parsed",
      icon: CheckCircle2,
      className: "border-emerald/20 bg-emerald/10 text-emerald",
    },
    pending: {
      label: "Pending",
      icon: Clock3,
      className: "border-amber/20 bg-amber/10 text-amber",
    },
  }[status];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function TaskStatusChip({
  status,
}: {
  status: ExternalImportHistoryItem["task"]["status"];
}) {
  const meta = {
    failed: "border-red-200 bg-red-50 text-red-700",
    pending: "border-amber/20 bg-amber/10 text-amber",
    retryable: "border-amber/20 bg-amber/10 text-amber",
    running: "border-cyan/20 bg-cyan/10 text-cyan",
    success: "border-emerald/20 bg-emerald/10 text-emerald",
  }[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${meta}`}
    >
      {status}
    </span>
  );
}

function ExternalConnectionStatusChip({
  status,
}: {
  status: ExternalConnectionStatus;
}) {
  const meta = {
    available: {
      label: "Available",
      icon: CheckCircle2,
      className: "border-emerald/20 bg-emerald/10 text-emerald",
    },
    failed: {
      label: "Failed",
      icon: AlertTriangle,
      className: "border-red-200 bg-red-50 text-red-700",
    },
    untested: {
      label: "Untested",
      icon: Clock3,
      className: "border-amber/20 bg-amber/10 text-amber",
    },
  }[status];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "password" | "text";
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-xs font-semibold uppercase text-muted">
        {label}
      </span>
      <input
        id={id}
        className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
      : "border-emerald/20 bg-white text-emerald";

  return (
    <div className={`rounded-md border px-3 py-3 text-sm ${className}`}>
      {message}
    </div>
  );
}

function ImportResultAlert({
  result,
}: {
  result?: ExternalDatasetImportResponse;
}) {
  if (!result) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-md border border-emerald/20 bg-white px-3 py-3 text-sm text-emerald">
      <p>
        Created {result.dataset.name} ({result.row_count.toLocaleString()} rows)
      </p>
      <Link
        className="inline-flex h-8 items-center rounded-md border border-emerald/30 bg-emerald/10 px-3 text-xs font-semibold text-emerald transition hover:bg-emerald/20"
        to={`/datasets?project_id=${encodeURIComponent(result.dataset.project_id)}&dataset_id=${encodeURIComponent(result.dataset.id)}`}
      >
        Open dataset
      </Link>
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
  tone: "brand" | "cyan" | "amber" | "emerald";
}) {
  return (
    <div className={`rounded-md border px-4 py-3 ${toneClass(tone)}`}>
      <p className="text-xs font-semibold uppercase">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold">{value}</p>
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

interface SourceSummary {
  datasetCount: number;
  failedUploads: number;
  parsedUploads: number;
  totalUploads: number;
}

function summarizeSourceState(
  uploads: UploadRecord[],
  datasets: Dataset[],
): SourceSummary {
  return uploads.reduce<SourceSummary>(
    (summary, upload) => {
      summary.totalUploads += 1;
      if (upload.status === "parsed") {
        summary.parsedUploads += 1;
      }
      if (upload.status === "failed") {
        summary.failedUploads += 1;
      }
      return summary;
    },
    {
      datasetCount: datasets.length,
      failedUploads: 0,
      parsedUploads: 0,
      totalUploads: 0,
    },
  );
}

function toneClass(tone: "brand" | "cyan" | "amber" | "emerald") {
  return {
    amber: "border-amber/20 bg-amber/10 text-amber",
    brand: "border-brand/20 bg-blue-50 text-brand",
    cyan: "border-cyan/20 bg-cyan/10 text-cyan",
    emerald: "border-emerald/20 bg-emerald/10 text-emerald",
  }[tone];
}

function compactId(value: string) {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function externalTableKey(table: ExternalTable) {
  return `${table.schema_name || "-"}::${table.table_name}`;
}

function qualifiedTableName(table: ExternalTable) {
  return table.schema_name
    ? `${table.schema_name}.${table.table_name}`
    : table.table_name;
}

function qualifiedExternalImportName(item: ExternalImportHistoryItem) {
  if (!item.table_name) {
    return "-";
  }
  return item.schema_name
    ? `${item.schema_name}.${item.table_name}`
    : item.table_name;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function cleanDatasetNameFromExternalTable(tableName: string) {
  return (
    tableName
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (character) => character.toUpperCase()) ||
    "External Dataset"
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
