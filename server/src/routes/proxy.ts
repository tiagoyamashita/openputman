import net from "node:net";
import { Router } from "express";
import ipaddr from "ipaddr.js";
const router = Router();

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const PROXY_TIMEOUT_MS = 30_000;

function isPrivateOrLocal(ip: string): boolean {
  if (ip === "::1" || ip === "0.0.0.0") return true;
  try {
    const parsed = ipaddr.parse(ip);
    const range = parsed.range();
    return (
      range === "loopback" ||
      range === "private" ||
      range === "linkLocal" ||
      range === "uniqueLocal" ||
      range === "carrierGradeNat" ||
      range === "reserved" ||
      range === "unspecified"
    );
  } catch {
    return true;
  }
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = url.hostname;
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Requests to local or metadata hosts are blocked");
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrLocal(hostname)) {
      throw new Error("Requests to private or local IP addresses are blocked");
    }
    return url;
  }

  const { lookup } = await import("node:dns/promises");
  const records = await lookup(hostname, { all: true });
  for (const record of records) {
    if (isPrivateOrLocal(record.address)) {
      throw new Error("Requests resolving to private or local IPs are blocked");
    }
  }

  return url;
}

type ProxyBody = {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string | null;
};

router.post("/proxy", async (req, res) => {
  const started = Date.now();
  try {
    const payload = req.body as ProxyBody;
    const method = (payload.method ?? "GET").toUpperCase();
    if (!payload.url || typeof payload.url !== "string") {
      res.status(400).json({ error: "url is required" });
      return;
    }

    const url = await assertSafeUrl(payload.url);
    const headers = new Headers();
    if (payload.headers && typeof payload.headers === "object") {
      for (const [key, value] of Object.entries(payload.headers)) {
        if (!key || value == null) continue;
        const lower = key.toLowerCase();
        if (lower === "host" || lower === "content-length") continue;
        headers.set(key, String(value));
      }
    }

    const hasBody = payload.body != null && payload.body !== "" && method !== "GET" && method !== "HEAD";
    if (hasBody && typeof payload.body === "string" && Buffer.byteLength(payload.body) > MAX_BODY_BYTES) {
      res.status(413).json({ error: "Request body too large" });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method,
        headers,
        body: hasBody ? payload.body! : undefined,
        signal: controller.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > MAX_BODY_BYTES) {
      res.status(502).json({ error: "Upstream response too large" });
      return;
    }

    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const text = buffer.toString("utf8");
    res.json({
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
      body: text,
      timeMs: Date.now() - started,
      sizeBytes: buffer.byteLength,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Upstream request timed out"
          : err.message
        : "Proxy request failed";
    res.status(400).json({
      error: message,
      timeMs: Date.now() - started,
    });
  }
});

export default router;
