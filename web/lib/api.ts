const API_PROXY_PREFIX = "/api/proxy";

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

type QueryValue = string | number | boolean | undefined | null;

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function withQuery(path: string, query?: Record<string, QueryValue>) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof TypeError && /load failed|fetch/i.test(error.message)) {
    return "Не удалось подключиться к серверу. Проверьте, что web и backend доступны по HTTPS.";
  }
  if (error instanceof ApiError) {
    if (error.message === "Proxy request failed") {
      const details = (error.details as any)?.details;
      if (typeof details === "string" && details.length > 0) {
        return `Ошибка прокси: ${details}`;
      }
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Неизвестная ошибка";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_PROXY_PREFIX}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let details: unknown;
    try {
      const data = await res.json();
      details = data;
      if (typeof data?.error === "string") {
        message = data.error;
      } else if (typeof data?.message === "string") {
        message = data.message;
      } else if (typeof data === "string") {
        message = data;
      }
    } catch {
      const text = await res.text();
      if (text) {
        message = text;
      }
    }
    throw new ApiError(message, res.status, details);
  }
  return res.json();
}

export const api = {
  authTelegram: (initData: string) => request<any>("/auth/telegram", { method: "POST", body: { initData } }),
  createHome: (token: string, name: string, timezone?: string) =>
    request<any>("/homes", { method: "POST", token, body: { name, timezone } }),
  joinInvite: (token: string, code: string) =>
    request<any>("/invites/join", { method: "POST", token, body: { code } }),
  leaveCurrentHome: (token: string) => request<any>("/homes/leave-current", { method: "POST", token, body: {} }),
  getCurrentHome: (token: string) => request<any>("/homes/current", { token }),
  getToday: (token: string, scope: "all" | "mine" = "mine") => request<any>(withQuery("/today", { scope }), { token }),
  getTasks: (
    token: string,
    scopeOrFilters:
      | "all"
      | "mine"
      | {
          scope?: "all" | "mine";
          from?: string;
          to?: string;
          status?: "all" | "open" | "done";
          assigneeId?: string;
          overdue?: boolean;
          noDueDate?: boolean;
          date?: string;
        } = "mine"
  ) => {
    const filters = typeof scopeOrFilters === "string" ? { scope: scopeOrFilters } : scopeOrFilters;
    return request<any>(withQuery("/tasks", filters), { token });
  },
  createTask: (token: string, payload: any) => request<any>("/tasks", { method: "POST", token, body: payload }),
  updateTask: (token: string, id: string, payload: any) =>
    request<any>(`/tasks/${id}`, { method: "PATCH", token, body: payload }),
  doneTask: (token: string, id: string) => request<any>(`/tasks/${id}/done`, { method: "POST", token }),
  getRoutines: (token: string) => request<any>("/routines", { token }),
  createRoutine: (token: string, payload: any) =>
    request<any>("/routines", { method: "POST", token, body: payload }),
  toggleRoutine: (token: string, id: string) => request<any>(`/routines/${id}/toggle`, { method: "POST", token }),
  doneRoutineInstance: (token: string, id: string) =>
    request<any>(`/routine-instances/${id}/done`, { method: "POST", token }),
  createInvite: (token: string) => request<any>("/invites", { method: "POST", token, body: {} }),
  getTasksSummaryByAssignee: (token: string, from?: string, to?: string) =>
    request<any>(withQuery("/tasks/summary/by-assignee", { from, to }), { token }),
  getCalendarFeeds: (token: string) => request<any>("/calendar/feeds", { token }),
  createCalendarFeed: (token: string, payload: { title: string; icsUrl: string }) =>
    request<any>("/calendar/feeds", { method: "POST", token, body: payload }),
  updateCalendarFeed: (token: string, id: string, payload: { title?: string; icsUrl?: string; isEnabled?: boolean }) =>
    request<any>(`/calendar/feeds/${id}`, { method: "PATCH", token, body: payload }),
  deleteCalendarFeed: (token: string, id: string) => request<any>(`/calendar/feeds/${id}`, { method: "DELETE", token }),
  syncCalendarFeed: (token: string, id: string) => request<any>(`/calendar/feeds/${id}/sync`, { method: "POST", token }),
  getCalendarEvents: (token: string, from: string, to: string, includeTasks = true) =>
    request<any>(withQuery("/calendar/events", { from, to, includeTasks }), { token }),
  getScoreboard: (token: string, period: "week" | "month" = "week") =>
    request<any>(withQuery("/scoreboard", { period }), { token })
};
