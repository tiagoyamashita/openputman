import express from "express";
import session from "express-session";
import cors from "cors";
import cookieParser from "cookie-parser";
import { assertAuthConfig, config } from "./config.js";
import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspace.js";
import proxyRoutes from "./routes/proxy.js";

assertAuthConfig();

const app = express();

app.set("trust proxy", 1);
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    name: "openputman.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "OpenPutMan" });
});

app.use("/auth", authRoutes);
app.use("/api", workspaceRoutes);
app.use("/api", proxyRoutes);

export default app;

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`[openputman] server listening on http://localhost:${config.port}`);
  });
}
