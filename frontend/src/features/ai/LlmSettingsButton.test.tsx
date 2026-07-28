import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  defaultLlmSettings,
  useWorkspaceStore,
} from "../workspace/workspaceStore";
import { vibeApi } from "../../lib/vibeApi";
import { renderWithProviders } from "../../test/test-utils";
import { LlmSettingsButton } from "./LlmSettingsButton";

describe("LlmSettingsButton", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkspaceStore.setState({
      language: "zh-CN",
      llm: defaultLlmSettings,
      llmRevision: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("测试并应用用户选择的大模型，但不持久化密钥", async () => {
    const user = userEvent.setup();
    const check = vi.spyOn(vibeApi, "checkLlm").mockResolvedValue({
      ok: true,
      model: "deepseek-chat",
      api_style: "chat_completions",
      message: "Connection verified",
    });
    renderWithProviders(<LlmSettingsButton />);

    await user.click(screen.getByRole("button", { name: "配置大模型" }));
    expect(
      screen.getByRole("dialog", { name: "模型设置" }),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("服务商"), "deepseek");
    expect(screen.getByLabelText("API Base URL")).toHaveValue(
      "https://api.deepseek.com/v1",
    );
    expect(screen.getByLabelText("模型")).toHaveValue("deepseek-chat");
    await user.type(screen.getByLabelText("API Key"), "session-secret");
    await user.click(
      screen.getByRole("checkbox", { name: "使用此大模型解说" }),
    );
    await user.click(screen.getByRole("button", { name: "测试连接" }));

    expect(
      await screen.findByText("连接成功：deepseek-chat"),
    ).toBeInTheDocument();
    expect(check).toHaveBeenCalledWith({
      api_key: "session-secret",
      api_style: "chat_completions",
      base_url: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    });

    await user.click(screen.getByRole("button", { name: "应用设置" }));
    expect(useWorkspaceStore.getState().llm).toMatchObject({
      apiKey: "session-secret",
      enabled: true,
      model: "deepseek-chat",
      provider: "deepseek",
    });
    expect(useWorkspaceStore.getState().llmRevision).toBe(1);
    expect(
      window.localStorage.getItem("vibe-data-universe.workspace"),
    ).not.toContain("session-secret");
  });
});
