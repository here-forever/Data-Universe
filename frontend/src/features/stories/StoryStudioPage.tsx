import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  Download,
  FileDown,
  FileText,
  GripVertical,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useCollaboration } from "../collaboration/collaborationState";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { useI18n } from "../../i18n";
import {
  type Story,
  type StoryBlock,
  type StoryBlockKind,
  queryKeys,
  vibeApi,
} from "../../lib/vibeApi";

type Translator = ReturnType<typeof useI18n>["t"];

export default function StoryStudioPage() {
  const queryClient = useQueryClient();
  const activeDatasetId = useWorkspaceStore((state) => state.activeDatasetId);
  const { language, t } = useI18n();
  const { send } = useCollaboration();
  const [requestedStoryId, setRequestedStoryId] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<{
    storyId: string;
    value: Story;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const datasets = useQuery({
    queryKey: queryKeys.datasets,
    queryFn: vibeApi.listDatasets,
  });
  const stories = useQuery({
    queryKey: queryKeys.stories,
    queryFn: vibeApi.listStories,
  });
  const selectedStoryId = useMemo(() => {
    if (!stories.data?.length) return null;
    if (
      requestedStoryId &&
      stories.data.some((story) => story.id === requestedStoryId)
    ) {
      return requestedStoryId;
    }
    return (
      stories.data.find((story) => story.dataset_id === activeDatasetId) ??
      stories.data[0]
    ).id;
  }, [activeDatasetId, requestedStoryId, stories.data]);
  const selectedStory = useQuery({
    queryKey: queryKeys.story(selectedStoryId),
    queryFn: () => vibeApi.getStory(selectedStoryId!),
    enabled: Boolean(selectedStoryId),
  });

  const draft =
    draftState?.storyId === selectedStoryId
      ? draftState.value
      : selectedStory.data
        ? structuredClone(selectedStory.data)
        : null;
  const setDraft: Dispatch<SetStateAction<Story | null>> = (update) => {
    setDraftState((current) => {
      const currentDraft =
        current?.storyId === selectedStoryId
          ? current.value
          : selectedStory.data
            ? structuredClone(selectedStory.data)
            : null;
      const next = typeof update === "function" ? update(currentDraft) : update;
      return next ? { storyId: next.id, value: next } : null;
    });
  };

  const create = useMutation({
    mutationFn: () =>
      vibeApi.createStory(
        activeDatasetId!,
        t("stories.defaultTitle"),
        language,
      ),
    onSuccess: async (story) => {
      setRequestedStoryId(story.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.stories });
    },
  });
  const save = useMutation({
    mutationFn: () =>
      vibeApi.updateStory(draft!.id, {
        title: draft!.title,
        summary: draft!.summary,
        blocks: draft!.blocks,
      }),
    onSuccess: async (story) => {
      setDraft(story);
      send("story_saved", { storyId: story.id, title: story.title });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.stories }),
        queryClient.invalidateQueries({ queryKey: queryKeys.story(story.id) }),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: vibeApi.deleteStory,
    onSuccess: async () => {
      setRequestedStoryId(null);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.stories });
    },
  });
  const exportStory = useMutation({
    mutationFn: (format: "html" | "pdf") =>
      vibeApi.exportStory(draft!.id, format, language),
    onMutate: () => setExportError(null),
    onSuccess: ({ blob, fileName }, format) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName ?? `${draft?.title ?? "data-story"}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => setExportError(error.message),
  });

  const isDirty = Boolean(
    draft &&
    selectedStory.data &&
    JSON.stringify(draft) !== JSON.stringify(selectedStory.data),
  );
  const datasetNames = useMemo(
    () =>
      new Map(
        datasets.data?.map((dataset) => [dataset.id, dataset.name]) ?? [],
      ),
    [datasets.data],
  );

  if (!activeDatasetId && !stories.data?.length) {
    return <StoryEmpty />;
  }

  return (
    <section className="workbench-page story-studio">
      <header className="page-heading compact-heading">
        <div>
          <span className="eyebrow">
            <BookOpen size={14} /> {t("stories.eyebrow")}
          </span>
          <h1>{t("stories.title")}</h1>
          <p>{t("stories.subtitle")}</p>
        </div>
        <div className="heading-actions">
          {draft && (
            <span className={`save-state${isDirty ? " is-dirty" : ""}`}>
              {isDirty ? (
                t("stories.unsaved")
              ) : (
                <>
                  <Check size={14} />
                  {t("stories.saved")}
                </>
              )}
            </span>
          )}
          <button
            className="command-button"
            disabled={!activeDatasetId || create.isPending}
            onClick={() => create.mutate()}
            type="button"
          >
            {create.isPending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Plus size={16} />
            )}
            {t("stories.new")}
          </button>
        </div>
      </header>

      <div className="story-layout">
        <aside className="story-browser">
          <div className="section-label">
            <span>{t("stories.flow")}</span>
            <strong>{stories.data?.length ?? 0}</strong>
          </div>
          <div className="story-list">
            {stories.data?.map((story) => (
              <button
                className={story.id === selectedStoryId ? "is-active" : ""}
                key={story.id}
                onClick={() => setRequestedStoryId(story.id)}
                type="button"
              >
                <span>
                  <FileText size={17} />
                </span>
                <div>
                  <strong>{story.title}</strong>
                  <small>
                    {datasetNames.get(story.dataset_id) ??
                      t("stories.datasetFallback")}{" "}
                    ·{" "}
                    {t("stories.sceneCount", {
                      count: story.blocks.length,
                    })}
                  </small>
                </div>
              </button>
            ))}
            {!stories.isLoading && !stories.data?.length && (
              <p>{t("stories.none")}</p>
            )}
          </div>
        </aside>

        <main className="story-editor-surface">
          {selectedStory.isLoading ? (
            <div className="surface-loading">
              <LoaderCircle className="spin" />
              {t("stories.opening")}
            </div>
          ) : draft ? (
            <>
              <div className="story-meta-editor">
                <label>
                  <span>{t("stories.storyTitle")}</span>
                  <input
                    maxLength={200}
                    onChange={(event) =>
                      patchDraft(setDraft, { title: event.target.value })
                    }
                    value={draft.title}
                  />
                </label>
                <label>
                  <span>{t("stories.summary")}</span>
                  <textarea
                    maxLength={2000}
                    onChange={(event) =>
                      patchDraft(setDraft, { summary: event.target.value })
                    }
                    rows={3}
                    value={draft.summary}
                  />
                </label>
              </div>
              <div className="story-blocks">
                {draft.blocks.map((block, index) => (
                  <BlockEditor
                    block={block}
                    index={index}
                    key={block.id}
                    onChange={(next) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              blocks: current.blocks.map((item) =>
                                item.id === block.id ? next : item,
                              ),
                            }
                          : current,
                      )
                    }
                    onMove={(direction) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              blocks: moveItem(
                                current.blocks,
                                index,
                                index + direction,
                              ),
                            }
                          : current,
                      )
                    }
                    onRemove={() =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              blocks: current.blocks.filter(
                                (item) => item.id !== block.id,
                              ),
                            }
                          : current,
                      )
                    }
                    total={draft.blocks.length}
                  />
                ))}
              </div>
              <button
                className="add-story-block"
                onClick={() =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          blocks: [...current.blocks, newNarrativeBlock(t)],
                        }
                      : current,
                  )
                }
                type="button"
              >
                <Plus size={16} />
                {t("stories.addNarrative")}
              </button>
              <div className="story-editor-actions">
                <button
                  className="danger-link"
                  onClick={() => {
                    if (window.confirm(t("stories.deleteConfirm")))
                      remove.mutate(draft.id);
                  }}
                  type="button"
                >
                  <Trash2 size={15} />
                  {t("stories.delete")}
                </button>
                <button
                  className="command-button"
                  disabled={!isDirty || save.isPending || !draft.title.trim()}
                  onClick={() => save.mutate()}
                  type="button"
                >
                  {save.isPending ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Save size={16} />
                  )}
                  {save.isPending ? t("stories.saving") : t("stories.save")}
                </button>
              </div>
            </>
          ) : (
            <div className="empty-surface">
              <Sparkles size={30} />
              <h2>{t("stories.generateTitle")}</h2>
              <p>{t("stories.generateBody")}</p>
              <button
                className="command-button"
                disabled={!activeDatasetId}
                onClick={() => create.mutate()}
                type="button"
              >
                <Plus size={16} />
                {t("stories.generate")}
              </button>
            </div>
          )}
        </main>

        <aside className="story-preview-pane">
          <div className="preview-toolbar">
            <span>{t("stories.preview")}</span>
            <div>
              <button
                className="icon-button"
                disabled={!draft || exportStory.isPending}
                onClick={() => exportStory.mutate("html")}
                title={t("stories.exportHtml")}
                type="button"
              >
                <Download size={17} />
              </button>
              <button
                className="icon-button"
                disabled={!draft || exportStory.isPending}
                onClick={() => exportStory.mutate("pdf")}
                title={t("stories.exportPdf")}
                type="button"
              >
                <FileDown size={17} />
              </button>
            </div>
          </div>
          {exportError && (
            <p className="form-error">
              <AlertTriangle size={14} />
              {exportError}
            </p>
          )}
          {draft ? (
            <StoryPreview story={draft} />
          ) : (
            <div className="preview-placeholder">
              <BookOpen size={28} />
              <p>{t("stories.selectPreview")}</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function BlockEditor({
  block,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  block: StoryBlock;
  index: number;
  total: number;
  onChange: (block: StoryBlock) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <article className="story-block-editor">
      <div className="block-grip">
        <GripVertical size={17} />
        <span>{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="block-fields">
        <div className="block-kind">
          <span className={`kind-dot story-${block.kind}`} />
          {blockKindName(block.kind, t)}
        </div>
        <input
          aria-label={t("stories.sceneTitle", { count: index + 1 })}
          onChange={(event) =>
            onChange({ ...block, title: event.target.value })
          }
          value={block.title}
        />
        <textarea
          aria-label={t("stories.sceneBody", { count: index + 1 })}
          onChange={(event) => onChange({ ...block, body: event.target.value })}
          rows={3}
          value={block.body}
        />
      </div>
      <div className="block-actions">
        <button
          className="icon-button"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          title={t("stories.moveUp")}
          type="button"
        >
          <ArrowUp size={15} />
        </button>
        <button
          className="icon-button"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          title={t("stories.moveDown")}
          type="button"
        >
          <ArrowDown size={15} />
        </button>
        <button
          className="icon-button danger-icon"
          onClick={onRemove}
          title={t("stories.removeBlock")}
          type="button"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function StoryPreview({ story }: { story: Story }) {
  const { t } = useI18n();
  return (
    <article className="story-reading-view">
      <header>
        <span>{t("stories.dataStory")}</span>
        <h2>{story.title}</h2>
        <p>{story.summary}</p>
      </header>
      {story.blocks.map((block, index) => (
        <section key={block.id}>
          <small>
            {String(index + 1).padStart(2, "0")} ·{" "}
            {blockKindName(block.kind, t)}
          </small>
          <h3>{block.title}</h3>
          <p>{block.body}</p>
          {block.kind === "metric" && block.payload.value !== undefined && (
            <strong className="story-metric">
              {String(block.payload.value)}
            </strong>
          )}
          {block.kind === "quality" &&
            block.payload.quality_score !== undefined && (
              <div className="story-quality">
                <i
                  style={{ width: `${Number(block.payload.quality_score)}%` }}
                />
              </div>
            )}
        </section>
      ))}
    </article>
  );
}

function patchDraft(
  setDraft: Dispatch<SetStateAction<Story | null>>,
  changes: Partial<Story>,
) {
  setDraft((current) => (current ? { ...current, ...changes } : current));
}
function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
function newNarrativeBlock(t: Translator): StoryBlock {
  return {
    id: `block_${crypto.randomUUID()}`,
    kind: "narrative",
    title: t("stories.newObservation"),
    body: t("stories.newObservationBody"),
    payload: {},
  };
}
function blockKindName(kind: StoryBlockKind, t: Translator): string {
  return t(`stories.kind.${kind}`);
}

function StoryEmpty() {
  const { t } = useI18n();
  return (
    <section className="workbench-page">
      <div className="empty-surface full-empty">
        <BookOpen size={34} />
        <h2>{t("stories.emptyTitle")}</h2>
        <p>{t("stories.emptyBody")}</p>
        <Link className="command-button" to="/data">
          {t("stories.goToData")}
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
