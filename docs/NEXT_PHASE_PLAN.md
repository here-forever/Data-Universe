# Next Phase Delivery Plan

Last updated: 2026-07-27

## Product Objective

Continue from the demo-ready MVP and turn the current local-file-first workflow into a dependable personal and small-team analysis product.

The delivery sequence remains:

```text
local file -> retained upload -> preview -> formal dataset
  -> cleaning / SQL / analysis -> reusable data view
  -> chart -> dashboard / report / data screen -> export
```

External database and API source development stays paused until the local workflow is reliable, reusable, and easy to operate.

## Current Baseline

The repository already provides the complete horizontal workflow: local CSV/Excel intake, physical datasets, cleaning recipes, SQL data views, statistical analysis, chart configuration, dashboard/report modes, exports, tasks, audit records, and lineage hooks.

The remaining work is therefore depth-first rather than page-count-first. Each phase below strengthens an existing product path and must retain source files, operation records, task visibility, and lineage.

## Delivery Phases

### Phase 1: Local Intake Completion — Delivered

Scope:

- Make the Data Sources page the primary CSV/Excel intake surface.
- Support click-to-select and drag-and-drop for `.csv`, `.xlsx`, and `.xlsm` files.
- Validate formats before upload and show selected-file metadata.
- Create the parse preview directly, then continue in the import wizard.
- Add upload-history status filters, text search, clear feedback, and responsive behavior.
- Keep failed uploads and formal dataset links visible for traceability.

Acceptance:

- A user can select or drop a supported file and reach its preview without visiting a second upload entry first.
- Unsupported files are rejected locally without sending a create request.
- Upload history can be filtered and searched with explicit empty-result feedback.
- Desktop and narrow-screen layouts have no page-level horizontal overflow.
- Frontend tests, lint, build, and browser interaction checks pass.

### Phase 2: Reliable Large Local Imports — Delivered

Scope:

- Stream CSV rows and iterate Excel worksheets without loading duplicate full-file structures into memory.
- Infer fields from a bounded sample while preserving an exact total row count.
- Batch PostgreSQL inserts and persist task progress checkpoints.
- Add configurable file-size, row-count, and parse-time guardrails with actionable errors.
- Keep staged files recoverable when parsing or materialization fails.

Acceptance:

- Large imports use bounded-memory parsing and batched writes.
- Task progress reflects parsing and materialization stages.
- A failed run leaves the original file, error context, and retry entry intact.
- Dataset row counts and lineage remain correct after batched materialization.

Delivered implementation:

- Upload requests copy their spooled file to durable storage in bounded chunks.
- CSV parsing and read-only Excel worksheet iteration are reopenable and keep only bounded inference/preview samples.
- Preview scans enforce configured byte, row, and elapsed-time limits while retaining exact accepted row counts.
- Formal dataset tables consume row iterators through configurable insert batches and reject source row-count drift before commit.
- Parse and materialization tasks persist running-stage checkpoints, retain their last checkpoint on failure, and keep retry metadata where recovery is possible.
- Staged source files and failed upload metadata remain available after parse or materialization failures.

### Phase 3: Reusable Analysis Assets — Delivered

Scope:

- Persist saved analysis definitions for filters, dimensions, metrics, statistics, and model configuration.
- Re-run a saved definition against its source dataset.
- Materialize selected results as data views.
- Promote saved results into chart and dashboard/report creation.
- Record analysis-to-data-view lineage and operation logs.

Acceptance:

- A configured analysis can be saved, reopened, executed, and promoted without re-entering its setup.
- Downstream resources retain stable references to the saved analysis and source dataset.

Delivered implementation:

- Versioned analysis definitions persist aggregate dimensions, metrics, filters, sorting, limits, statistics, correlation, regression, and presentation configuration.
- Saved analyses can be selected or reopened through an `analysis_id` route, rerun against their source dataset, and restored without re-entering configuration.
- Aggregate, numeric-statistics, categorical-statistics, correlation, and regression results can be materialized as physical data views.
- Materialized views retain `analysis_definition` source references and feed the existing chart and dashboard/report builders through stable route parameters.
- Dataset-to-analysis and analysis-to-data-view lineage, operation logs, and materialization task records preserve traceability.

### Phase 4: Report and Export Delivery — Delivered

Scope:

- Persist dashboard global filters and active selections.
- Complete reusable report/data-screen layout editing.
- Add consistent CSV/Excel exports and printable report export.
- Expose export execution through the task center for longer jobs.

Acceptance:

- Saved dashboards reopen with layout, filters, and chart configuration intact.
- Exported artifacts identify their source resource and create audit/task records.

Delivered implementation:

- Dashboard configurations now use a versioned layout contract with legacy-layout normalization and optimistic concurrency control for safe updates.
- Dashboard, free-layout report, and data-screen modes persist chart order, width, height, global filters, active chart selections, and one of three report themes.
- The report workbench supports compact layout editing, visible active-filter feedback, chart-to-chart filtering, saved configuration recovery, and responsive desktop/mobile operation.
- CSV exports contain chart-level aggregated detail, XLSX exports include source metadata plus one worksheet per chart, and printable PDF exports retain report identity and source references.
- Export files are stored durably and can be listed and downloaded from report history; every export records a source snapshot, task state, operation log, and lineage edge.
- Failed report exports retain retry metadata and can be replayed through the existing task-center retry entry.

### Phase 5: Governance and Release Hardening — Next

Scope:

- Harden authentication and project/member workflows.
- Add archive/restore flows for important resources.
- Expose operation logs and a focused lineage/dependency view.
- Add integration coverage for the full seeded workflow.
- Finalize deployment, backup, upgrade, and recovery documentation.

Acceptance:

- Important resources are recoverable and destructive actions are explicit.
- Users can answer where a report came from and which assets depend on a dataset.
- A clean Docker Compose environment can migrate, seed, validate, back up, and restore the product.

## Execution Rules

- Deliver one phase through focused Git milestones; do not mix unrelated refactors.
- Keep routes thin, workflow decisions in services, and persistence in repositories.
- Add tests at the service and user-flow boundaries before declaring a phase complete.
- Verify frontend work in a real browser at desktop and mobile widths.
- Update `docs/IMPLEMENTATION_STATUS.md` after every completed milestone.
