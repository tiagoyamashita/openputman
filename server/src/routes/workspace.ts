import { Router } from "express";
import { requireAuth } from "../auth.js";
import { loadOrCreateWorkspace, saveWorkspace } from "../gist.js";
import { normalizeWorkspace } from "../types.js";

const router = Router();

router.get("/workspace", requireAuth, async (req, res) => {
  try {
    const token = req.session.user!.accessToken;
    const { workspace, gistId } = await loadOrCreateWorkspace(token);
    req.session.gistId = gistId;
    res.json({ workspace, gistId });
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to load workspace",
    });
  }
});

router.put("/workspace", requireAuth, async (req, res) => {
  try {
    const token = req.session.user!.accessToken;
    const workspace = normalizeWorkspace(req.body?.workspace);
    if (!workspace) {
      res.status(400).json({ error: "Invalid workspace payload" });
      return;
    }

    let gistId = typeof req.body?.gistId === "string" ? req.body.gistId : req.session.gistId;
    if (!gistId) {
      const created = await loadOrCreateWorkspace(token);
      gistId = created.gistId;
      req.session.gistId = gistId;
    }

    await saveWorkspace(token, gistId, workspace);
    req.session.gistId = gistId;
    res.json({ ok: true, gistId });
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to save workspace",
    });
  }
});

export default router;
