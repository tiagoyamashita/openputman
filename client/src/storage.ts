import { emptyWorkspace, normalizeWorkspace, type Workspace } from "./types";
import { safeJsonParse } from "./json";

const STORAGE_KEY = "openputman-workspace";

export function loadLocalWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) return emptyWorkspace();
    const parsed = safeJsonParse(raw);
    return normalizeWorkspace(parsed) ?? emptyWorkspace();
  } catch {
    return emptyWorkspace();
  }
}

export function saveLocalWorkspace(workspace: Workspace): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}
