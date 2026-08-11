import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useWorkspaceStore } from "./workspace/workspaceStore";
import type {
  AnalysisRun,
  AskResponse,
  DatasetDetail,
  DatasetSummary,
  ExploreResponse,
  ParticleResponse,
  RowPage,
  Story,
} from "../lib/vibeApi";
import { vibeApi } from "../lib/vibeApi";
import { renderWithProviders } from "../test/test-utils";
import AnalysisLabPage from "./analysis/AnalysisLabPage";
import DataWorkbenchPage from "./data/DataWorkbenchPage";
import StoryStudioPage from "./stories/StoryStudioPage";
import UniversePage from "./universe/UniversePage";

const collaboration = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("./collaboration/collaborationState", () => ({
  useCollaboration: () => ({
    chartFilter: null,
    connected: true,
    online: 1,
    particleMapping: null,
    recentEvent: null,
    send: collaboration.send,
  }),
}));

vi.mock("./ai/LlmSettingsButton", () => ({
  LlmSettingsButton: () => <button type="button">模型设置</button>,
}));

vi.mock("./analysis/AnalysisChart", () => ({
  default: ({ chart }: { chart?: { title: string } }) => (
    <div>chart:{chart?.title ?? "correlations"}</div>
  ),
}));

vi.mock("./universe/ParticleUniverse", () => ({
  default: ({
    onSelect,
    paused,
    points,
  }: {
    onSelect: (point: ParticleResponse["points"][number]) => void;
    paused: boolean;
    points: ParticleResponse["points"];
  }) => (
    <button onClick={() => points[0] && onSelect(points[0])} type="button">
      particle-canvas:{points.length}:{paused ? "paused" : "playing"}
    </button>
  ),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 38,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 3) }, (_, index) => ({
        index,
        key: index,
        size: 38,
        start: index * 38,
      })),
    measureElement: vi.fn(),
  }),
}));

const summary: DatasetSummary = {
  id: "dataset-1",
  name: "校园节律",
  source_filename: "student_learning_rhythm.csv",
  file_type: "csv",
  row_count: 240,
  column_count: 3,
  active_revision: 1,
  quality_score: 94,
  created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z",
};

const dataset: DatasetDetail = {
  ...summary,
  profile: {
    row_count: 240,
    column_count: 3,
    missing_cells: 2,
    duplicate_rows: 1,
    quality_score: 94,
    mapping: {
      x: "study_hours",
      y: "course_score",
      z: null,
      color: "department",
      time: null,
    },
    columns: [
      {
        name: "study_hours",
        kind: "numeric",
        missing_count: 2,
        missing_ratio: 0.01,
        unique_count: 20,
        stats: {
          mean: 5.2,
          median: 5,
          std: 1.2,
          min: 1,
          max: 9,
          q1: 4,
          q3: 6,
          outlier_count: 1,
        },
      },
      {
        name: "course_score",
        kind: "numeric",
        missing_count: 0,
        missing_ratio: 0,
        unique_count: 80,
        stats: {
          mean: 82,
          median: 83,
          std: 8,
          min: 55,
          max: 100,
          q1: 76,
          q3: 89,
          outlier_count: 0,
        },
      },
      {
        name: "department",
        kind: "categorical",
        missing_count: 0,
        missing_ratio: 0,
        unique_count: 2,
        top_values: [
          { value: "Design", count: 120, ratio: 0.5 },
          { value: "Science", count: 120, ratio: 0.5 },
        ],
      },
    ],
  },
  preview: [{ study_hours: 4, course_score: 78, department: "Design" }],
  transformations: [],
};

const rows: RowPage = {
  dataset_id: summary.id,
  revision: 1,
  offset: 0,
  limit: 200,
  total: 2,
  columns: ["study_hours", "course_score", "department"],
  rows: [
    { study_hours: 4, course_score: 78, department: "Design" },
    { study_hours: 6, course_score: 91, department: "Science" },
  ],
};

const exploration: ExploreResponse = {
  dataset_id: summary.id,
  revision: 1,
  overview: {
    row_count: 240,
    source_row_count: 240,
    column_count: 3,
    quality_score: 94,
    numeric_fields: 2,
    categorical_fields: 1,
    datetime_fields: 0,
    filters: [],
  },
  correlations: {
    fields: ["study_hours", "course_score"],
    matrix: [
      [1, 0.82],
      [0.82, 1],
    ],
    strongest_pairs: [
      { left: "study_hours", right: "course_score", value: 0.82 },
    ],
  },
  distributions: [],
  anomalies: [{ row: 8, field: "course_score", value: 100, z_score: 2.8 }],
  charts: [
    {
      id: "bar:department:course_score",
      rank: 1,
      type: "bar",
      title: "院系成绩比较",
      reason: "比较不同院系",
      score: 88,
      confidence: "high",
      signals: ["两个院系", "覆盖完整", "差异明显"],
      x_field: "department",
      y_field: "course_score",
      categories: ["Design", "Science"],
      series: [78, 91],
    },
  ],
};

const answer: AskResponse = {
  analysis_id: "analysis-1",
  dataset_id: summary.id,
  mode: "statistical_engine",
  model: null,
  answer: "学习时长与课程成绩呈明显正相关。",
  evidence: ["240 行", "相关系数 0.82"],
  suggested_chart: exploration.charts[0],
};

const run: AnalysisRun = {
  id: "run-1",
  dataset_id: summary.id,
  kind: "regression",
  request: {},
  result: { observations: 240, r_squared: 0.67, significant: true },
  created_at: "2026-08-03T00:00:00Z",
};

const story: Story = {
  id: "story-1",
  dataset_id: summary.id,
  title: "校园节律故事",
  summary: "从学习时长与成绩关系开始。",
  blocks: [
    {
      id: "block-1",
      kind: "cover",
      title: "开场",
      body: "观察校园学习节律。",
      payload: {},
    },
  ],
  created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z",
};

describe("主工作区关键交互", () => {
  beforeEach(() => {
    window.localStorage.clear();
    collaboration.send.mockClear();
    useWorkspaceStore.setState({
      activeDatasetId: summary.id,
      language: "zh-CN",
      scenePaused: false,
      selectedParticleId: null,
      theme: "dark",
    });
    vi.spyOn(vibeApi, "listDatasets").mockResolvedValue([summary]);
    vi.spyOn(vibeApi, "getDataset").mockResolvedValue(dataset);
    vi.spyOn(vibeApi, "getRows").mockResolvedValue(rows);
    vi.spyOn(vibeApi, "getParticles").mockResolvedValue({
      dataset_id: summary.id,
      mapping: dataset.profile.mapping,
      points: [
        {
          id: 1,
          x: 0.1,
          y: 0.2,
          z: 0.3,
          color: "#64e6c4",
          label: "Design student",
          values: { study_hours: 4, course_score: 78 },
        },
      ],
    });
    vi.spyOn(vibeApi, "explore").mockResolvedValue(exploration);
    vi.spyOn(vibeApi, "ask").mockResolvedValue(answer);
    vi.spyOn(vibeApi, "advanced").mockResolvedValue(run);
    vi.spyOn(vibeApi, "history").mockResolvedValue([]);
    vi.spyOn(vibeApi, "listStories").mockResolvedValue([story]);
    vi.spyOn(vibeApi, "getStory").mockResolvedValue(story);
    vi.spyOn(vibeApi, "createStory").mockResolvedValue(story);
    vi.spyOn(vibeApi, "updateStory").mockImplementation(
      async (_id, changes) => ({ ...story, ...changes }),
    );
    vi.spyOn(vibeApi, "exportStory").mockResolvedValue({
      blob: new Blob(["report"]),
      fileName: "story.html",
    });
    vi.spyOn(vibeApi, "deleteStory").mockResolvedValue(undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:story");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("数据工作台切换预览、画像、清洗并打开上传面板", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataWorkbenchPage />);

    expect(await screen.findByText("1-2 / 2")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "字段画像" }));
    expect(screen.getAllByText("study_hours").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "版本化清洗" }));
    expect(screen.getByText("当前版本操作")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "接入文件" }));
    expect(
      screen.getByRole("dialog", { name: "接入新数据" }),
    ).toBeInTheDocument();
  });

  test("分析实验室完成智能探索、问数和回归", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnalysisLabPage />);

    expect(await screen.findByText("chart:院系成绩比较")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "与数据对话" }));
    const question = screen.getByLabelText("自然语言数据问题");
    await user.clear(question);
    await user.type(question, "最明显的关系是什么？");
    await user.click(screen.getByRole("button", { name: "开始分析" }));
    expect(await screen.findByText(answer.answer)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "高级统计" }));
    await user.click(screen.getByRole("button", { name: "运行分析" }));
    expect(await screen.findByText("0.67")).toBeInTheDocument();
  });

  test("数据宇宙加载粒子、点选记录、暂停并提问", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniversePage />);

    const canvas = await screen.findByRole("button", {
      name: "particle-canvas:1:playing",
    });
    await user.click(canvas);
    expect(screen.getByText("Design student")).toBeInTheDocument();
    await user.click(screen.getByTitle("暂停巡航"));
    expect(
      screen.getByRole("button", { name: "particle-canvas:1:paused" }),
    ).toBeInTheDocument();

    const question = screen.getByLabelText("向数据提问");
    await user.clear(question);
    await user.type(question, "请解释相关性");
    await user.click(screen.getByTitle("发送问题"));
    expect(await screen.findByText(answer.answer)).toBeInTheDocument();
  });

  test("故事编辑器修改故事、添加段落、保存并导出", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StoryStudioPage />);

    const title = await screen.findByLabelText("故事标题");
    await user.clear(title);
    await user.type(title, "新的校园故事");
    await user.click(screen.getByRole("button", { name: "添加叙事段落" }));
    await user.click(screen.getByRole("button", { name: "保存故事" }));
    expect(vibeApi.updateStory).toHaveBeenCalled();
    await user.click(screen.getByTitle("导出 HTML"));
    expect(vibeApi.exportStory).toHaveBeenCalledWith(story.id, "html", "zh-CN");
  });
});
