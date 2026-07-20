import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { CleaningWorkbenchPage } from "../features/cleaning/CleaningWorkbenchPage";
import { FluidDataDashboard } from "../features/dashboard/FluidDataDashboard";
import { DataSourcesPage } from "../features/dataSources/DataSourcesPage";
import { DataViewSourcePage } from "../features/dataViews/DataViewSourcePage";
import { DatasetPage } from "../features/datasets/DatasetPage";
import { ImportWizardPage } from "../features/imports/ImportWizardPage";
import { SqlWorkspacePage } from "../features/sql/SqlWorkspacePage";
import { TaskCenterPage } from "../features/tasks/TaskCenterPage";
import { AppShell } from "./AppShell";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<FluidDataDashboard />} />
        <Route
          path="data-sources"
          element={
            <FeatureSurface>
              <DataSourcesPage />
            </FeatureSurface>
          }
        />
        <Route
          path="import"
          element={
            <FeatureSurface>
              <ImportWizardPage />
            </FeatureSurface>
          }
        />
        <Route
          path="datasets"
          element={
            <FeatureSurface>
              <DatasetPage />
            </FeatureSurface>
          }
        />
        <Route
          path="cleaning"
          element={
            <FeatureSurface>
              <CleaningWorkbenchPage />
            </FeatureSurface>
          }
        />
        <Route
          path="sql"
          element={
            <FeatureSurface>
              <SqlWorkspacePage />
            </FeatureSurface>
          }
        />
        <Route
          path="charts"
          element={
            <FeatureSurface>
              <DataViewSourcePage mode="charts" />
            </FeatureSurface>
          }
        />
        <Route
          path="dashboards"
          element={
            <FeatureSurface>
              <DataViewSourcePage mode="dashboards" />
            </FeatureSurface>
          }
        />
        <Route
          path="tasks"
          element={
            <FeatureSurface>
              <TaskCenterPage />
            </FeatureSurface>
          }
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}

function FeatureSurface({ children }: { children: ReactNode }) {
  return <div className="content workbench-surface">{children}</div>;
}
