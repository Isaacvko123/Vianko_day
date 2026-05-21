import type { ApiErrorBody, AuthTokens } from "../types";

const fallbackApiUrl = "/api/v1";
const configuredApiUrl = import.meta.env.VITE_API_URL || fallbackApiUrl;

function enforceProductionApiTransport(apiUrl: string) {
  if (import.meta.env.PROD && apiUrl.startsWith("http://")) {
    throw new Error("Production API URL must use HTTPS or a same-origin relative path.");
  }

  return apiUrl;
}

export const apiBaseUrl = enforceProductionApiTransport(configuredApiUrl);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type ApiRequestOptions = {
  token?: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
};

function normalizeServerValues(value: unknown): unknown {
  if (value == undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeServerValues);
  }

  if (typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, normalizeServerValues(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined);

    return Object.fromEntries(normalizedEntries);
  }

  return value;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return {} as T;
  }

  const responseText = await response.text();

  if (!responseText.trim()) {
    return {} as T;
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(responseText);
  } catch {
    throw new ApiError(
      response.status,
      "INVALID_API_RESPONSE",
      "El servidor no devolvio una respuesta valida."
    );
  }

  const payload = normalizeServerValues(parsedPayload) as T;
  return payload;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "No se pudo conectar con la API. Revisa que el backend este activo."
    );
  }

  const payload = await parseJsonResponse<T & ApiErrorBody>(response);

  if (!response.ok) {
    const fallbackMessage = response.status >= 500
      ? "La API no esta respondiendo correctamente. Revisa que el backend este activo."
      : "No se pudo completar la solicitud.";

    throw new ApiError(
      response.status,
      payload.error?.code ?? "API_ERROR",
      payload.error?.message ?? fallbackMessage
    );
  }

  return payload;
}

export function authHeader(tokens: AuthTokens | undefined) {
  return tokens?.accessToken;
}
