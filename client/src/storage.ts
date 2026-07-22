import { emptyWorkspace, normalizeWorkspace, type Workspace } from "./types";

const STORAGE_KEY = "openputman-workspace";

export function loadLocalWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    const parsed: unknown = JSON.parse(raw);
    return normalizeWorkspace(parsed) ?? emptyWorkspace();
  } catch {
    return emptyWorkspace();
  }
}

export function saveLocalWorkspace(workspace: Workspace): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}
