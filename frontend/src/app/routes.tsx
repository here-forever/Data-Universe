import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useI18n } from "../i18n";
import { AppShell } from "./AppShell";
import {
  loadAnalysisLabPage,
  loadDataWorkbenchPage,
  loadStoryStudioPage,
  loadUniversePage,
} from "./routeModules";

const UniversePage = lazy(loadUniversePage);
const DataWorkbenchPage = lazy(loadDataWorkbenchPage);
const AnalysisLabPage = lazy(loadAnalysisLabPage);
const StoryStudioPage = lazy(loadStoryStudioPage);

function RouteFallback() {
  const { t } = useI18n();
  return (
    <div className="route-fallback" role="status">
      <span className="loading-orbit" aria-hidden="true" />
      <p>{t("route.loading")}</p>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<UniversePage />} />
          <Route path="data" element={<DataWorkbenchPage />} />
          <Route path="analysis" element={<AnalysisLabPage />} />
          <Route path="stories" element={<StoryStudioPage />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  );
}
