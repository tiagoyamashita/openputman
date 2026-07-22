import type { ProxyResponse, User, Workspace } from "./types";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    throw new Error("Empty response from server");
  }

  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`Invalid JSON from server (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchMe(): Promise<User | null> {
  const res = await fetch("/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  return parseJson<User>(res);
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST", credentials: "include" });
}

export async function loadWorkspace(): Promise<{ workspace: Workspace; gistId: string }> {
  const res = await fetch("/api/workspace", { credentials: "include" });
  return parseJson(res);
}

export async function saveWorkspace(
  workspace: Workspace,
  gistId: string | null,
): Promise<{ gistId: string }> {
  const res = await fetch("/api/workspace", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, gistId }),
  });
  return parseJson(res);
}

export async function proxyRequest(input: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}): Promise<ProxyResponse> {
  const res = await fetch("/api/proxy", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(res.ok ? "Empty proxy response" : `Proxy failed (${res.status})`);
  }

  let data: ProxyResponse & { error?: string };
  try {
    data = JSON.parse(text) as ProxyResponse & { error?: string };
  } catch {
    throw new Error(`Invalid proxy response (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Proxy failed (${res.status})`);
  }
  return data;
}
