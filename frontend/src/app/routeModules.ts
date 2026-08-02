export const loadUniversePage = () =>
  import("../features/universe/UniversePage");
export const loadDataWorkbenchPage = () =>
  import("../features/data/DataWorkbenchPage");
export const loadAnalysisLabPage = () =>
  import("../features/analysis/AnalysisLabPage");
export const loadStoryStudioPage = () =>
  import("../features/stories/StoryStudioPage");

const routeLoaders: Record<string, () => Promise<unknown>> = {
  "/": loadUniversePage,
  "/analysis": loadAnalysisLabPage,
  "/data": loadDataWorkbenchPage,
  "/stories": loadStoryStudioPage,
};

export function preloadRoute(path: string): void {
  if (typeof window === "undefined") return;

  void routeLoaders[path]?.().catch(() => undefined);
}
