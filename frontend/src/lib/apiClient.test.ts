import { afterEach, describe, expect, test, vi } from "vitest";

import { ApiError, createApiClient } from "./apiClient";

describe("apiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("joins base URL and path when requesting JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const client = createApiClient({
      baseUrl: "http://127.0.0.1:8000/api",
      fetcher: fetchMock,
    });
    const result = await client.get<{ status: string }>("/health");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/health", {
      headers: { Accept: "application/json" },
      method: "GET",
    });
    expect(result).toEqual({ status: "ok" });
  });

  test("adds bearer token when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const client = createApiClient({
      accessToken: "local-dev-token-usr_admin",
      baseUrl: "http://127.0.0.1:8000/api",
      fetcher: fetchMock,
    });
    await client.get("/datasets");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/datasets",
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer local-dev-token-usr_admin",
        },
        method: "GET",
      },
    );
  });

  test("appends query parameters to GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const client = createApiClient({
      baseUrl: "http://127.0.0.1:8000/api",
      fetcher: fetchMock,
    });

    await client.get("/datasets", {
      project_id: "prj_1",
      page: 2,
      empty: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/datasets?project_id=prj_1&page=2",
      {
        headers: { Accept: "application/json" },
        method: "GET",
      },
    );
  });

  test("posts JSON body with authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "dataset_1" }),
    });
    const client = createApiClient({
      accessToken: "token",
      baseUrl: "http://localhost/api",
      fetcher: fetchMock,
    });

    await client.post("/datasets", { name: "Sales" });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost/api/datasets", {
      body: JSON.stringify({ name: "Sales" }),
      headers: {
        Accept: "application/json",
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  test("patches JSON resources", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "src_1" }),
    });
    const client = createApiClient({
      baseUrl: "http://localhost/api",
      fetcher: fetchMock,
    });

    await client.patch("/data-sources/external-databases/src_1", {
      host: "warehouse.local",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost/api/data-sources/external-databases/src_1",
      {
        body: JSON.stringify({ host: "warehouse.local" }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "PATCH",
      },
    );
  });

  test("posts FormData without forcing content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "preview_1" }),
    });
    const client = createApiClient({
      baseUrl: "http://localhost/api",
      fetcher: fetchMock,
    });
    const body = new FormData();
    body.set("project_id", "prj_1");

    await client.postForm("/imports/file-previews", body);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost/api/imports/file-previews",
      {
        body,
        headers: { Accept: "application/json" },
        method: "POST",
      },
    );
  });

  test("throws ApiError with status code when request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Server failed" } }),
    });

    const client = createApiClient({
      baseUrl: "http://localhost/api",
      fetcher: fetchMock,
    });

    await expect(client.get("/broken")).rejects.toEqual(
      new ApiError("Server failed", 500),
    );
  });
});
