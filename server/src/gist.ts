import {
  emptyWorkspace,
  GIST_DESCRIPTION,
  GIST_FILENAME,
  isWorkspace,
  type Workspace,
} from "./types.js";

type GistFile = { content?: string; filename?: string };
type Gist = {
  id: string;
  description: string | null;
  files: Record<string, GistFile>;
};

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "openputman",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function listGists(token: string): Promise<Gist[]> {
  const gists: Gist[] = [];
  let page = 1;
  while (page <= 10) {
    const res = await fetch(`https://api.github.com/gists?per_page=100&page=${page}`, {
      headers: githubHeaders(token),
    });
    if (!res.ok) {
      throw new Error(`Failed to list gists (${res.status})`);
    }
    const batch = (await res.json()) as Gist[];
    gists.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return gists;
}

function parseWorkspaceFromGist(gist: Gist): Workspace | null {
  const file =
    gist.files[GIST_FILENAME] ??
    Object.values(gist.files).find((f) => f.filename === GIST_FILENAME) ??
    Object.values(gist.files)[0];
  if (!file?.content) return null;
  try {
    const parsed: unknown = JSON.parse(file.content);
    return isWorkspace(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadOrCreateWorkspace(
  token: string,
): Promise<{ workspace: Workspace; gistId: string }> {
  const gists = await listGists(token);
  const existing = gists.find((g) => g.description === GIST_DESCRIPTION);

  if (existing) {
    const detailRes = await fetch(`https://api.github.com/gists/${existing.id}`, {
      headers: githubHeaders(token),
    });
    if (!detailRes.ok) {
      throw new Error(`Failed to load gist (${detailRes.status})`);
    }
    const detail = (await detailRes.json()) as Gist;
    const workspace = parseWorkspaceFromGist(detail) ?? emptyWorkspace();
    return { workspace, gistId: detail.id };
  }

  const workspace = emptyWorkspace();
  const createRes = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      ...githubHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(workspace, null, 2),
        },
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create gist (${createRes.status}): ${text}`);
  }

  const created = (await createRes.json()) as Gist;
  return { workspace, gistId: created.id };
}

export async function saveWorkspace(
  token: string,
  gistId: string,
  workspace: Workspace,
): Promise<void> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      ...githubHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(workspace, null, 2),
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save gist (${res.status}): ${text}`);
  }
}
