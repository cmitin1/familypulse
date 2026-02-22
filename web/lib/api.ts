const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  authTelegram: (initData: string) => request<any>("/auth/telegram", { method: "POST", body: { initData } }),
  createHome: (token: string, name: string, timezone?: string) =>
    request<any>("/homes", { method: "POST", token, body: { name, timezone } }),
  joinInvite: (token: string, code: string) =>
    request<any>("/invites/join", { method: "POST", token, body: { code } }),
  getCurrentHome: (token: string) => request<any>("/homes/current", { token }),
  getToday: (token: string, scope: "all" | "mine" = "mine") => request<any>(`/today?scope=${scope}`, { token }),
  getTasks: (token: string, scope: "all" | "mine" = "mine") => request<any>(`/tasks?scope=${scope}`, { token }),
  createTask: (token: string, payload: any) => request<any>("/tasks", { method: "POST", token, body: payload }),
  doneTask: (token: string, id: string) => request<any>(`/tasks/${id}/done`, { method: "POST", token }),
  getRoutines: (token: string) => request<any>("/routines", { token }),
  createRoutine: (token: string, payload: any) =>
    request<any>("/routines", { method: "POST", token, body: payload }),
  toggleRoutine: (token: string, id: string) => request<any>(`/routines/${id}/toggle`, { method: "POST", token }),
  doneRoutineInstance: (token: string, id: string) =>
    request<any>(`/routine-instances/${id}/done`, { method: "POST", token }),
  createInvite: (token: string) => request<any>("/invites", { method: "POST", token, body: {} }),
  getScoreboard: (token: string, period: "week" | "month" = "week") =>
    request<any>(`/scoreboard?period=${period}`, { token })
};
