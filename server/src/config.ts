import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config();

function vercelOrigin(): string | undefined {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
}

const deployedOrigin = vercelOrigin();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? deployedOrigin ?? "http://localhost:5173",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-openputman-secret-change-me",
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  githubCallbackUrl:
    process.env.GITHUB_CALLBACK_URL ??
    (deployedOrigin
      ? `${deployedOrigin}/auth/github/callback`
      : "http://localhost:4000/auth/github/callback"),
};

export function assertAuthConfig(): void {
  if (!config.githubClientId || !config.githubClientSecret) {
    console.warn(
      "[openputman] GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set — OAuth will fail until configured.",
    );
  }
}
