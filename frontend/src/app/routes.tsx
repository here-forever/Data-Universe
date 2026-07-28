import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useI18n } from "../i18n";
import { AppShell } from "./AppShell";

const UniversePage = lazy(() => import("../features/universe/UniversePage"));
const DataWorkbenchPage = lazy(
  () => import("../features/data/DataWorkbenchPage"),
);
const AnalysisLabPage = lazy(
  () => import("../features/analysis/AnalysisLabPage"),
);
const StoryStudioPage = lazy(
  () => import("../features/stories/StoryStudioPage"),
);

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
