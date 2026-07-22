import type { ProxyResponse, User, Workspace } from "./types";
import { safeJsonParse } from "./json";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = safeJsonParse(text) as (T & { error?: string }) | undefined;
  if (data === undefined) {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    throw new Error("Empty or invalid JSON from server");
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchMe(): Promise<User | null> {
  try {
    const res = await fetch("/auth/me", { credentials: "include" });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    const data = safeJsonParse(text) as User | undefined;
    return data ?? null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // ignore offline logout failures
  }
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
  const data = safeJsonParse(text) as (ProxyResponse & { error?: string }) | undefined;
  if (data === undefined) {
    throw new Error(res.ok ? "Empty proxy response" : `Proxy failed (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Proxy failed (${res.status})`);
  }
  return data;
}
