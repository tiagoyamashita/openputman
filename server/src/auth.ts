import type { Request, Response, NextFunction } from "express";

export type SessionUser = {
  accessToken: string;
  login: string;
  avatar: string;
  name: string | null;
};

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    gistId?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user?.accessToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
