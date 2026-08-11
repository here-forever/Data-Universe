import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { useI18n, type TranslationKey } from "../../i18n";
import type { ChartRecommendation } from "../../lib/vibeApi";
import { vibeApi } from "../../lib/vibeApi";

const AnalysisChart = lazy(() => import("./AnalysisChart"));

const chartTypeNameKeys: Record<ChartRecommendation["type"], TranslationKey> = {
  line: "analysis.chartType.line",
  bar: "analysis.chartType.bar",
  scatter: "analysis.chartType.scatter",
  histogram: "analysis.chartType.histogram",
};

export function ExploreWorkspace({
  exploration,
  onFilter,
  theme,
}: {
  exploration: Awaited<ReturnType<typeof vibeApi.explore>>;
  onFilter: (field: string, value: string) => void;
  theme: "dark" | "light";
}) {
  const { formatNumber, t } = useI18n();
  const [selectedChartId, setSelectedChartId] = useState(
    exploration.charts[0]?.id ?? "",
  );
  const selectedChart =
    exploration.charts.find((chart) => chart.id === selectedChartId) ??
    exploration.charts[0];

  return (
    <div className="explore-workspace">
      <div className="analysis-vitals">
        <span>
          <small>{t("analysis.currentSample")}</small>
          <strong>{formatNumber(exploration.overview.row_count)}</strong>
        </span>
        <span>
          <small>{t("analysis.numericFields")}</small>
          <strong>{exploration.overview.numeric_fields}</strong>
        </span>
        <span>
          <small>{t("analysis.categoricalFields")}</small>
          <strong>{exploration.overview.categorical_fields}</strong>
        </span>
        <span>
          <small>{t("analysis.anomalyClues")}</small>
          <strong>{exploration.anomalies.length}</strong>
        </span>
      </div>
      {selectedChart ? (
        <section className="smart-recommender">
          <header className="recommender-heading">
            <div>
              <span className="eyebrow">
                <Sparkles size={14} /> {t("analysis.smartRecommendation")}
              </span>
              <h2>
                {t("analysis.recommendationTitle", {
                  type: t(chartTypeNameKeys[selectedChart.type]),
                })}
              </h2>
              <p>
                {t("analysis.recommendationSummary", {
                  rows: formatNumber(exploration.overview.row_count),
                  columns: exploration.overview.column_count,
                  count: exploration.charts.length,
                })}
              </p>
            </div>
            <div
              aria-label={t("analysis.fitScoreLabel", {
                score: selectedChart.score,
              })}
              className={`recommendation-score ${selectedChart.confidence}`}
            >
              <strong>{selectedChart.score}</strong>
              <small>{t("analysis.fitScore")}</small>
            </div>
          </header>

          <div className="recommender-layout">
            <aside className="recommendation-rail">
              <span>{t("analysis.rankedOptions")}</span>
              {exploration.charts.map((chart) => (
                <button
                  aria-pressed={chart.id === selectedChart.id}
                  className={chart.id === selectedChart.id ? "is-active" : ""}
                  key={chart.id}
                  onClick={() => setSelectedChartId(chart.id)}
                  type="button"
                >
                  <b>0{chart.rank}</b>
                  <span>
                    <strong>{t(chartTypeNameKeys[chart.type])}</strong>
                    <small>
                      {chart.x_field}
                      {chart.y_field ? ` × ${chart.y_field}` : ""}
                    </small>
                  </span>
                  <em>{chart.score}</em>
                </button>
              ))}
            </aside>

            <article className="recommended-chart-stage">
              <div className="chart-heading recommendation-chart-heading">
                <div>
                  <div className="recommendation-badges">
                    <span>
                      {selectedChart.rank === 1
                        ? t("analysis.autoApplied")
                        : t("analysis.optionApplied")}
                    </span>
                    <span className={`confidence-${selectedChart.confidence}`}>
                      {t(`analysis.confidence.${selectedChart.confidence}`)}
                    </span>
                  </div>
                  <strong>{selectedChart.title}</strong>
                  <small>{selectedChart.reason}</small>
                </div>
                {selectedChart.type === "bar" ? (
                  <span>
                    <Filter size={13} />
                    {t("analysis.clickToLink")}
                  </span>
                ) : null}
              </div>
              <div className="recommendation-signals">
                {selectedChart.signals.map((signal) => (
                  <span key={signal}>
                    <CheckCircle2 size={12} />
                    {signal}
                  </span>
                ))}
              </div>
              <Suspense
                fallback={
                  <div className="chart-loading">
                    <LoaderCircle className="spin" />
                  </div>
                }
              >
                <AnalysisChart
                  chart={selectedChart}
                  onFilter={onFilter}
                  theme={theme}
                />
              </Suspense>
            </article>
          </div>
        </section>
      ) : (
        <p className="empty-inline smart-recommendation-empty">
          {t("analysis.noChartRecommendation")}
        </p>
      )}
      <div className="eda-lower-grid">
        <section className="correlation-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("analysis.relationship")}</span>
              <h2>{t("analysis.correlationMatrix")}</h2>
            </div>
            <span>
              {t("analysis.fieldCount", {
                count: exploration.correlations.fields.length,
              })}
            </span>
          </div>
          {exploration.correlations.matrix.length ? (
            <Suspense
              fallback={
                <div className="chart-loading">
                  <LoaderCircle className="spin" />
                </div>
              }
            >
              <AnalysisChart
                correlations={exploration.correlations}
                theme={theme}
              />
            </Suspense>
          ) : (
            <p className="empty-inline">{t("analysis.needTwoNumeric")}</p>
          )}
        </section>
        <section className="evidence-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("analysis.evidence")}</span>
              <h2>{t("analysis.priorityClues")}</h2>
            </div>
          </div>
          <div className="relationship-list">
            {exploration.correlations.strongest_pairs
              .slice(0, 5)
              .map((pair, index) => (
                <div key={`${pair.left}-${pair.right}`}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>
                      {pair.left} × {pair.right}
                    </strong>
                    <small>{t("analysis.linearCorrelation")}</small>
                  </div>
                  <b className={pair.value >= 0 ? "positive" : "negative"}>
                    {pair.value.toFixed(2)}
                  </b>
                </div>
              ))}
          </div>
          <div className="anomaly-list">
            {exploration.anomalies.slice(0, 4).map((anomaly) => (
              <div key={`${anomaly.field}-${anomaly.row}`}>
                <AlertTriangle size={15} />
                <span>
                  {t("analysis.anomalyRow", {
                    field: anomaly.field,
                    row: anomaly.row + 1,
                  })}
                </span>
                <b>{anomaly.z_score}σ</b>
              </div>
            ))}
            {!exploration.anomalies.length && (
              <p>
                <CheckCircle2 size={16} />
                {t("analysis.noAnomalies")}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
