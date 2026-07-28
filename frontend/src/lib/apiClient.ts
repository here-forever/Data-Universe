export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Fetcher = typeof fetch;

export interface ApiClientOptions {
  baseUrl: string;
  fetcher?: Fetcher;
}

export interface ApiClient {
  get<TResponse>(
    path: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<TResponse>;
  post<TResponse>(path: string, body?: unknown): Promise<TResponse>;
  download(
    path: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<{ blob: Blob; fileName: string | null }>;
  patch<TResponse>(path: string, body?: unknown): Promise<TResponse>;
  delete<TResponse>(path: string): Promise<TResponse>;
  postForm<TResponse>(path: string, body: FormData): Promise<TResponse>;
}

function joinUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  const url = new URL(
    `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`,
  );

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return (
      payload.error?.message ?? `Request failed with status ${response.status}`
    );
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export function createApiClient({
  baseUrl,
  fetcher = fetch,
}: ApiClientOptions): ApiClient {
  const jsonHeaders = () => ({ Accept: "application/json" });

  return {
    async get<TResponse>(
      path: string,
      params?: Record<string, string | number | boolean | null | undefined>,
    ): Promise<TResponse> {
      const response = await fetcher(joinUrl(baseUrl, path, params), {
        headers: jsonHeaders(),
        method: "GET",
      });

      return readJsonResponse<TResponse>(response);
    },

    async post<TResponse>(path: string, body?: unknown): Promise<TResponse> {
      const response = await fetcher(joinUrl(baseUrl, path), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          ...jsonHeaders(),
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      return readJsonResponse<TResponse>(response);
    },

    async download(
      path: string,
      params?: Record<string, string | number | boolean | null | undefined>,
    ): Promise<{ blob: Blob; fileName: string | null }> {
      const response = await fetcher(joinUrl(baseUrl, path, params), {
        headers: jsonHeaders(),
        method: "GET",
      });

      if (!response.ok) {
        throw new ApiError(await readErrorMessage(response), response.status);
      }

      return {
        blob: await response.blob(),
        fileName: readDownloadFileName(
          response.headers.get("Content-Disposition"),
        ),
      };
    },

    async patch<TResponse>(path: string, body?: unknown): Promise<TResponse> {
      const response = await fetcher(joinUrl(baseUrl, path), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          ...jsonHeaders(),
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      return readJsonResponse<TResponse>(response);
    },

    async delete<TResponse>(path: string): Promise<TResponse> {
      const response = await fetcher(joinUrl(baseUrl, path), {
        headers: jsonHeaders(),
        method: "DELETE",
      });

      return readJsonResponse<TResponse>(response);
    },

    async postForm<TResponse>(
      path: string,
      body: FormData,
    ): Promise<TResponse> {
      const response = await fetcher(joinUrl(baseUrl, path), {
        body,
        headers: jsonHeaders(),
        method: "POST",
      });

      return readJsonResponse<TResponse>(response);
    },
  };
}

function readDownloadFileName(
  contentDisposition: string | null,
): string | null {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

async function readJsonResponse<TResponse>(
  response: Response,
): Promise<TResponse> {
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }
  return (await response.json()) as TResponse;
}

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

export const apiClient = createApiClient({
  baseUrl: API_BASE_URL,
  fetcher: (...args) => fetch(...args),
});
