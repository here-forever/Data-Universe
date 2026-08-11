import { Check } from "lucide-react";
import { useMemo, type CSSProperties } from "react";

import { useI18n } from "../../i18n";
import type { ColumnProfile } from "../../lib/vibeApi";

export function QualityInspector({
  profile,
}: {
  profile: {
    quality_score: number;
    missing_cells: number;
    duplicate_rows: number;
    columns: ColumnProfile[];
  };
}) {
  const { formatNumber, t } = useI18n();
  const problemColumns = useMemo(
    () =>
      profile.columns
        .filter((column) => column.missing_count || column.stats?.outlier_count)
        .slice(0, 8),
    [profile.columns],
  );
  return (
    <aside className="quality-inspector">
      <div className="quality-score">
        <span
          style={
            {
              "--quality": `${profile.quality_score * 3.6}deg`,
            } as CSSProperties
          }
        >
          <strong>{profile.quality_score}</strong>
        </span>
        <div>
          <strong>{t("data.qualityTitle")}</strong>
          <small>{t("data.qualityMax")}</small>
        </div>
      </div>
      <dl className="quality-facts">
        <div>
          <dt>{t("data.missingCells")}</dt>
          <dd>{formatNumber(profile.missing_cells)}</dd>
        </div>
        <div>
          <dt>{t("data.duplicateRows")}</dt>
          <dd>{formatNumber(profile.duplicate_rows)}</dd>
        </div>
        <div>
          <dt>{t("data.fieldsToReview")}</dt>
          <dd>{problemColumns.length}</dd>
        </div>
      </dl>
      <div className="quality-issues">
        <span className="section-label">{t("data.fieldHints")}</span>
        {problemColumns.length ? (
          problemColumns.map((column) => (
            <div key={column.name}>
              <span>{column.name}</span>
              <small>
                {column.missing_count
                  ? t("data.missingIssue", { count: column.missing_count })
                  : t("data.outlierIssue", {
                      count: column.stats?.outlier_count ?? 0,
                    })}
              </small>
            </div>
          ))
        ) : (
          <p>
            <Check size={15} />
            {t("data.noQualityIssues")}
          </p>
        )}
      </div>
    </aside>
  );
}
