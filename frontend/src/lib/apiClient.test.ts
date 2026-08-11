import { afterEach, describe, expect, test, vi } from "vitest";

import { ApiError, createApiClient } from "./apiClient";
import { vibeApi } from "./vibeApi";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createApiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("构造查询参数并覆盖 JSON 写入方法与 204", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ created: true }, 201))
      .mockResolvedValueOnce(jsonResponse({ updated: true }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ uploaded: true }));
    const client = createApiClient({
      baseUrl: "https://data.example.com/api/v1/",
      fetcher,
    });

    await expect(
      client.get("/datasets", { limit: 20, active: true, skipped: null }),
    ).resolves.toEqual({ ok: true });
    await expect(client.post("datasets", { name: "demo" })).resolves.toEqual({
      created: true,
    });
    await expect(client.patch("stories/1", { title: "Next" })).resolves.toEqual(
      {
        updated: true,
      },
    );
    await expect(client.delete("datasets/1")).resolves.toBeUndefined();
    await expect(
      client.postForm("datasets/upload", new FormData()),
    ).resolves.toEqual({
      uploaded: true,
    });

    expect(fetcher.mock.calls[0][0]).toBe(
      "https://data.example.com/api/v1/datasets?limit=20&active=true",
    );
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      body: '{"name":"demo"}',
      method: "POST",
    });
    expect(fetcher.mock.calls[4][1]?.headers).not.toHaveProperty(
      "Content-Type",
    );
  });

  test("下载文件名并统一处理 JSON 与非 JSON 错误", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("report", {
          status: 200,
          headers: {
            "Content-Disposition": 'attachment; filename="story.pdf"',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Dataset missing" } }, 404),
      )
      .mockResolvedValueOnce(new Response("gateway", { status: 502 }));
    const client = createApiClient({
      baseUrl: "https://data.example.com/api/v1",
      fetcher,
    });

    const download = await client.download("stories/1/export", {
      format: "pdf",
    });
    expect(download.fileName).toBe("story.pdf");
    expect(download.blob.size).toBe(6);

    await expect(client.get("datasets/missing")).rejects.toEqual(
      expect.objectContaining<ApiError>({
        message: "Dataset missing",
        name: "ApiError",
        status: 404,
      }),
    );
    await expect(client.post("insights/check")).rejects.toEqual(
      expect.objectContaining<ApiError>({
        message: "Request failed with status 502",
        name: "ApiError",
        status: 502,
      }),
    );
  });

  test("vibeApi 将所有领域操作映射到版本化端点", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        requests.push({ method, url });
        if (method === "DELETE") return new Response(null, { status: 204 });
        if (url.includes("/export")) {
          return new Response("report", {
            headers: {
              "Content-Disposition": "attachment; filename=story.html",
            },
          });
        }
        return jsonResponse(
          url.endsWith("/datasets") || url.endsWith("/stories") ? [] : {},
        );
      }),
    );

    await vibeApi.listDatasets();
    await vibeApi.getDataset("d1");
    await vibeApi.getRows("d1", 10, 20);
    await vibeApi.uploadDataset(new File(["a,b\n1,2"], "demo.csv"), "Demo");
    await vibeApi.createDemo();
    await vibeApi.cleanDataset("d1", "Clean", [{ action: "drop_duplicates" }]);
    await vibeApi.deleteDataset("d1");
    await vibeApi.getParticles("d1", { x: "value", limit: 100 });
    await vibeApi.explore("d1", [{ field: "team", value: "A" }], "en-US");
    await vibeApi.ask("d1", "Explain", "en-US");
    await vibeApi.checkLlm({
      api_style: "responses",
      base_url: "https://api.example.com/v1",
      model: "example",
    });
    await vibeApi.advanced("d1", { method: "clustering" });
    await vibeApi.history("d1");
    await vibeApi.listStories();
    await vibeApi.getStory("s1");
    await vibeApi.createStory("d1", "Story", "en-US");
    await vibeApi.updateStory("s1", { title: "Updated" });
    await vibeApi.deleteStory("s1");
    await vibeApi.exportStory("s1", "html", "en-US");

    expect(requests).toHaveLength(19);
    expect(requests.every(({ url }) => url.includes("/api/v1/"))).toBe(true);
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/insights/d1/ask"),
      }),
    );
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: "PATCH",
        url: expect.stringContaining("/stories/s1"),
      }),
    );
  });
});
