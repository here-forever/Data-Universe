import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useRef } from "react";

import { useI18n } from "../../i18n";
import type { RowPage } from "../../lib/vibeApi";
import { formatPreviewCell } from "./previewTableUtils";

interface PreviewTableProps {
  page: RowPage | undefined;
  onNext: () => void;
  onPrevious: () => void;
}

export function PreviewTable({ page, onNext, onPrevious }: PreviewTableProps) {
  const { formatNumber, t } = useI18n();
  const scrollContainer = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: page?.rows.length ?? 0,
    estimateSize: () => 38,
    getScrollElement: () => scrollContainer.current,
    overscan: 8,
  });

  if (!page) {
    return (
      <div className="surface-loading">
        <RefreshCw className="spin" />
        {t("data.loadingRows")}
      </div>
    );
  }

  const start = page.total === 0 ? 0 : page.offset + 1;
  const end = Math.min(page.offset + page.rows.length, page.total);
  const gridTemplateColumns = `48px repeat(${page.columns.length}, minmax(140px, 1fr))`;
  return (
    <div className="preview-region">
      <div className="table-scroll virtual-table-scroll" ref={scrollContainer}>
        <div
          aria-colcount={page.columns.length + 1}
          aria-rowcount={page.rows.length + 1}
          className="virtual-data-table"
          role="table"
          style={{ minWidth: 48 + page.columns.length * 140 }}
        >
          <div className="virtual-table-head" role="rowgroup">
            <div
              className="virtual-table-row"
              role="row"
              style={{ gridTemplateColumns }}
            >
              <div className="row-number" role="columnheader">
                #
              </div>
              {page.columns.map((column) => (
                <div key={column} role="columnheader">
                  {column}
                </div>
              ))}
            </div>
          </div>
          <div
            className="virtual-table-body"
            role="rowgroup"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = page.rows[virtualRow.index];
              return (
                <div
                  aria-rowindex={virtualRow.index + 2}
                  className="virtual-table-row"
                  data-index={virtualRow.index}
                  key={page.offset + virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  role="row"
                  style={{
                    gridTemplateColumns,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="row-number" role="cell">
                    {page.offset + virtualRow.index + 1}
                  </div>
                  {page.columns.map((column) => (
                    <div key={column} role="cell">
                      {formatPreviewCell(row[column])}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="table-pagination">
        <span>
          {start}-{end} / {formatNumber(page.total)}
        </span>
        <div>
          <button
            className="icon-button"
            disabled={page.offset === 0}
            onClick={onPrevious}
            title={t("data.previousPage")}
            type="button"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            className="icon-button"
            disabled={end >= page.total}
            onClick={onNext}
            title={t("data.nextPage")}
            type="button"
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
