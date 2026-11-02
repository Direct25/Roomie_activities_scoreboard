import type {
  Activity,
  Entry,
  Household,
  Leaderboard,
  User,
  WeekResult,
} from "./types";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const TOKEN_KEY = "roomie.token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode: the session simply won't survive a reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = tokenStore.get();

  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.details) ? data.details[0]?.message : undefined;
    throw new ApiError(response.status, detail ?? data.error ?? "Something went wrong");
  }
  return data as T;
}

interface AuthResult {
  token: string;
  user: User;
}

export const api = {
  register: (name: string, email: string, password: string) =>
    request<AuthResult>("/auth/register", "POST", { name, email, password }),
  login: (email: string, password: string) =>
    request<AuthResult>("/auth/login", "POST", { email, password }),
  me: () => request<{ user: User }>("/auth/me"),

  createHousehold: (name: string, timezone: string) =>
    request<{ user: User; household: Household }>("/households", "POST", { name, timezone }),
  joinHousehold: (code: string) =>
    request<{ user: User; household: Household }>("/households/join", "POST", { code }),
  household: () => request<{ household: Household }>("/households/me"),
  leaveHousehold: () => request<{ user: User }>("/households/leave", "POST"),

  activities: () => request<{ activities: Activity[] }>("/activities"),
  createActivity: (input: { name: string; emoji?: string; points: number }) =>
    request<{ activity: Activity }>("/activities", "POST", input),
  archiveActivity: (id: string) => request<{ ok: true }>(`/activities/${id}`, "DELETE"),

  entries: () => request<{ entries: Entry[] }>("/entries?limit=50"),
  logEntry: (activityId: string, note?: string) =>
    request<{ entry: Entry }>("/entries", "POST", { activityId, note: note || undefined }),
  undoEntry: (id: string) => request<{ ok: true }>(`/entries/${id}`, "DELETE"),
  disputeEntry: (id: string) => request<{ entry: Entry }>(`/entries/${id}/dispute`, "POST"),
  reinstateEntry: (id: string) => request<{ entry: Entry }>(`/entries/${id}/reinstate`, "POST"),

  leaderboard: (week?: string) =>
    request<Leaderboard>(`/leaderboard${week ? `?week=${encodeURIComponent(week)}` : ""}`),
  history: () => request<{ history: WeekResult[] }>("/leaderboard/history"),
};
