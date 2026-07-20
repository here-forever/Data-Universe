import type { ReactNode } from "react";

import { CleaningWorkbenchPage } from "../features/cleaning/CleaningWorkbenchPage";
import { DataSourcesPage } from "../features/dataSources/DataSourcesPage";
import { DataViewSourcePage } from "../features/dataViews/DataViewSourcePage";
import { DatasetPage } from "../features/datasets/DatasetPage";
import { ImportWizardPage } from "../features/imports/ImportWizardPage";
import { SqlWorkspacePage } from "../features/sql/SqlWorkspacePage";
import { TaskCenterPage } from "../features/tasks/TaskCenterPage";
import { WorkspaceHomePage } from "./WorkspaceHomePage";

export const routePlaceholders: Record<string, ReactNode> = {
  "/": <WorkspaceHomePage />,
  "/data-sources": <DataSourcesPage />,
  "/import": <ImportWizardPage />,
  "/datasets": <DatasetPage />,
  "/cleaning": <CleaningWorkbenchPage />,
  "/sql": <SqlWorkspacePage />,
  "/charts": <DataViewSourcePage mode="charts" />,
  "/dashboards": <DataViewSourcePage mode="dashboards" />,
  "/tasks": <TaskCenterPage />,
};
