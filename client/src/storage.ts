import { emptyWorkspace, type Workspace } from "./types";

const STORAGE_KEY = "openputman-workspace";

function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const w = value as Workspace;
  return w.version === 1 && Array.isArray(w.collections) && Array.isArray(w.environments);
}

export function loadLocalWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    const parsed: unknown = JSON.parse(raw);
    return isWorkspace(parsed) ? parsed : emptyWorkspace();
  } catch {
    return emptyWorkspace();
  }
}

export function saveLocalWorkspace(workspace: Workspace): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}
