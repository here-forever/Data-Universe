import { useI18n, type TranslationKey } from "../../i18n";
import type { ColumnProfile } from "../../lib/vibeApi";

const kindLabelKeys: Record<ColumnProfile["kind"], TranslationKey> = {
  numeric: "data.kind.numeric",
  categorical: "data.kind.categorical",
  boolean: "data.kind.boolean",
  datetime: "data.kind.datetime",
  text: "data.kind.text",
};

export function ProfileView({ columns }: { columns: ColumnProfile[] }) {
  const { formatNumber, t } = useI18n();
  return (
    <div className="profile-grid">
      {columns.map((column) => (
        <article className="column-profile" key={column.name}>
          <div className="column-profile-heading">
            <div>
              <strong>{column.name}</strong>
              <span className={`kind-badge kind-${column.kind}`}>
                {t(kindLabelKeys[column.kind])}
              </span>
            </div>
            <small>
              {t("data.uniqueValues", {
                count: formatNumber(column.unique_count),
              })}
            </small>
          </div>
          <div className="missing-track">
            <span
              style={{ width: `${Math.max(2, column.missing_ratio * 100)}%` }}
            />
          </div>
          <p>
            {column.missing_count
              ? t("data.missingValues", { count: column.missing_count })
              : t("data.noMissing")}
          </p>
          {column.stats ? (
            <dl className="mini-stats">
              <div>
                <dt>{t("data.mean")}</dt>
                <dd>{column.stats.mean}</dd>
              </div>
              <div>
                <dt>{t("data.median")}</dt>
                <dd>{column.stats.median}</dd>
              </div>
              <div>
                <dt>{t("data.std")}</dt>
                <dd>{column.stats.std}</dd>
              </div>
              <div>
                <dt>{t("data.outliers")}</dt>
                <dd>{column.stats.outlier_count}</dd>
              </div>
            </dl>
          ) : (
            <div className="top-values">
              {column.top_values?.slice(0, 4).map((item) => (
                <span key={item.value}>
                  <i style={{ width: `${Math.max(8, item.ratio * 100)}%` }} />
                  {item.value}
                  <small>{item.count}</small>
                </span>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
