import { Router } from "express";
import { config } from "../config.js";
import type { SessionUser } from "../auth.js";

const router = Router();

router.get("/github", (_req, res) => {
  if (!config.githubClientId) {
    res.status(500).send("GitHub OAuth is not configured. Set GITHUB_CLIENT_ID.");
    return;
  }
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: config.githubCallbackUrl,
    scope: "read:user gist",
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get("/github/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  if (!code) {
    res.status(400).send("Missing OAuth code");
    return;
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
        redirect_uri: config.githubCallbackUrl,
      }),
    });

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenJson.access_token) {
      res
        .status(400)
        .send(tokenJson.error_description ?? tokenJson.error ?? "Token exchange failed");
      return;
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenJson.access_token}`,
        "User-Agent": "openputman",
      },
    });

    if (!userRes.ok) {
      res.status(502).send("Failed to fetch GitHub user");
      return;
    }

    const userJson = (await userRes.json()) as {
      login: string;
      avatar_url: string;
      name: string | null;
    };

    const user: SessionUser = {
      accessToken: tokenJson.access_token,
      login: userJson.login,
      avatar: userJson.avatar_url,
      name: userJson.name,
    };

    req.session.user = user;
    res.redirect(config.clientOrigin);
  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth callback failed");
  }
});

router.get("/me", (req, res) => {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({
    login: user.login,
    avatar: user.avatar,
    name: user.name,
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.clearCookie("openputman.sid");
    res.json({ ok: true });
  });
});

export default router;
