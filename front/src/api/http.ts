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
export const authSessionExpiredEventName = "vianko-day:auth-session-expired";

export type AuthSessionExpiredDetail = {
  status: number;
  code: string;
  message: string;
  path: string;
};

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

function shouldNotifyExpiredSession(path: string, options: ApiRequestOptions, status: number, code: string) {
  if (status !== 401) {
    return false;
  }

  if (path === "/auth/refresh" && (code === "REFRESH_INVALID" || code === "REFRESH_REUSED")) {
    return true;
  }

  return Boolean(options.token) && (code === "AUTH_INVALID" || code === "AUTH_REQUIRED");
}

function notifyExpiredSession(detail: AuthSessionExpiredDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<AuthSessionExpiredDetail>(authSessionExpiredEventName, { detail }));
}

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
    const errorCode = payload.error?.code ?? "API_ERROR";
    const fallbackMessage = response.status >= 500
      ? "La API no esta respondiendo correctamente. Revisa que el backend este activo."
      : "No se pudo completar la solicitud.";
    const errorMessage = payload.error?.message ?? fallbackMessage;

    if (shouldNotifyExpiredSession(path, options, response.status, errorCode)) {
      notifyExpiredSession({
        status: response.status,
        code: errorCode,
        message: errorMessage,
        path
      });
    }

    throw new ApiError(
      response.status,
      errorCode,
      errorMessage
    );
  }

  return payload;
}

export function authHeader(tokens: AuthTokens | undefined) {
  return tokens?.accessToken;
}
