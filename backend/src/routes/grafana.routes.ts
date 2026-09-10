import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { RequestWithUser } from "../types/index.js";
import prisma from "../config/database.js";

const router = Router();

// ── Constants ────────────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 10_000;
const MAX_DASHBOARDS_LIMIT = 100;

const DEFAULT_DASHBOARDS = [
  { uid: "overview", name: "Overview" },
  { uid: "infrastructure", name: "Infrastructure" },
  { uid: "deployments", name: "Deployments" },
];

// ── Validation schemas ───────────────────────────────────────────────────────
const configUpdateSchema = z.object({
  url: z.string().url().optional().or(z.literal("")),
  frontendUrl: z.string().url().optional().or(z.literal("")),
  apiKey: z.string().optional(),
  dashboards: z
    .array(
      z.object({
        uid: z.string().min(1),
        name: z.string().min(1),
      })
    )
    .optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function logGrafana(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  const prefix = `[Grafana] ${msg}`;
  if (level === "error") console.error(prefix, meta ?? "");
  else if (level === "warn") console.warn(prefix, meta ?? "");
  else console.log(prefix, meta ?? "");
}

async function getGrafanaConfig() {
  const [urlSetting, apiKeySetting, dashboardsSetting, frontendUrlSetting] =
    await Promise.all([
      prisma.setting.findUnique({ where: { key: "grafana_url" } }),
      prisma.setting.findUnique({ where: { key: "grafana_api_key" } }),
      prisma.setting.findUnique({ where: { key: "grafana_dashboards" } }),
      prisma.setting.findUnique({ where: { key: "grafana_frontend_url" } }),
    ]);

  const grafanaUrl =
    (urlSetting?.value as string) || process.env.GRAFANA_URL || "";
  const apiKey =
    (apiKeySetting?.value as string) || process.env.GRAFANA_API_KEY || "";

  // Frontend URL defaults to http://localhost:3000 for browser access
  const frontendUrl =
    (frontendUrlSetting?.value as string) || process.env.GRAFANA_FRONTEND_URL || "http://localhost:3000";

  let dashboards = DEFAULT_DASHBOARDS;
  if (dashboardsSetting?.value) {
    const dbDashboards = dashboardsSetting.value;
    if (Array.isArray(dbDashboards)) {
      dashboards = dbDashboards;
    }
  } else if (process.env.GRAFANA_DASHBOARDS) {
    try {
      dashboards = process.env.GRAFANA_DASHBOARDS.split(";").map((d) => {
        const [uid, name] = d.split(":");
        return { uid, name: name || uid };
      });
    } catch {
      // Use defaults
    }
  }

  return {
    url: grafanaUrl,
    frontendUrl,
    apiKey,
    dashboards,
    isConfigured: !!grafanaUrl,
  };
}

function buildGrafanaHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Fetch from Grafana API with timeout and error handling.
 * Returns { ok, status, data } where data is parsed JSON or error text.
 */
async function grafanaFetch(
  url: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, status: response.status, data: body };
    }

    const json = await response.json();
    return { ok: true, status: response.status, data: json };
  } catch (error: any) {
    clearTimeout(timeout);
    const message =
      error.name === "AbortError"
        ? "Grafana request timed out"
        : error.message || "Unknown error";
    return { ok: false, status: 502, data: message };
  }
}

/**
 * Map external Grafana HTTP status to a proxy status code.
 * 401/403 become 502 so the frontend interceptor doesn't clear the JWT.
 */
function proxyStatus(httpStatus: number): number {
  return httpStatus === 401 || httpStatus === 403 ? 502 : httpStatus;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/grafana/config
router.get(
  "/config",
  authenticate,
  requirePermission("view-projects"),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getGrafanaConfig();

      res.status(200).json({
        success: true,
        data: {
          url: config.url,
          frontendUrl: config.frontendUrl,
          hasApiKey: !!config.apiKey,
          dashboards: config.dashboards,
          isConfigured: config.isConfigured,
        },
        message: "Grafana configuration retrieved",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/grafana/config
router.put(
  "/config",
  authenticate,
  requirePermission("update-projects"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const parsed = configUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: "Invalid configuration data",
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const { url, frontendUrl, apiKey, dashboards } = parsed.data;
      const upserts = [];

      if (url !== undefined) {
        upserts.push(
          prisma.setting.upsert({
            where: { key: "grafana_url" },
            update: { value: url, group: "grafana" },
            create: { key: "grafana_url", value: url, group: "grafana" },
          })
        );
      }
      if (frontendUrl !== undefined) {
        upserts.push(
          prisma.setting.upsert({
            where: { key: "grafana_frontend_url" },
            update: { value: frontendUrl, group: "grafana" },
            create: { key: "grafana_frontend_url", value: frontendUrl, group: "grafana" },
          })
        );
      }
      if (apiKey !== undefined) {
        upserts.push(
          prisma.setting.upsert({
            where: { key: "grafana_api_key" },
            update: { value: apiKey, group: "grafana" },
            create: { key: "grafana_api_key", value: apiKey, group: "grafana" },
          })
        );
      }
      if (dashboards !== undefined) {
        upserts.push(
          prisma.setting.upsert({
            where: { key: "grafana_dashboards" },
            update: { value: dashboards, group: "grafana" },
            create: { key: "grafana_dashboards", value: dashboards, group: "grafana" },
          })
        );
      }

      if (upserts.length > 0) {
        await prisma.$transaction(upserts);
        logGrafana("info", "Config updated", { keys: upserts.map((_, i) => i) });
      }

      const config = await getGrafanaConfig();

      res.status(200).json({
        success: true,
        data: {
          url: config.url,
          frontendUrl: config.frontendUrl,
          hasApiKey: !!config.apiKey,
          dashboards: config.dashboards,
          isConfigured: config.isConfigured,
        },
        message: "Grafana configuration updated",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/grafana/dashboards
router.get(
  "/dashboards",
  authenticate,
  requirePermission("view-projects"),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getGrafanaConfig();
      if (!config.url) {
        res.status(503).json({ success: false, error: "Grafana is not configured" });
        return;
      }

      const headers = buildGrafanaHeaders(config.apiKey);
      const apiUrl = `${config.url}/api/search?type=dash-db&limit=${MAX_DASHBOARDS_LIMIT}`;

      logGrafana("info", "Fetching dashboards", { url: apiUrl });
      const result = await grafanaFetch(apiUrl, headers);

      if (!result.ok) {
        logGrafana("warn", "Dashboards API error", { status: result.status });
        res.status(proxyStatus(result.status)).json({
          success: false,
          error: `Grafana API returned ${result.status}. Configure an API key in Grafana settings.`,
        });
        return;
      }

      const normalized = result.data.map((d: any) => ({
        id: d.id,
        uid: d.uid,
        title: d.title,
        folderTitle: d.folderTitle || "General",
        folderUid: d.folderUid || "",
        tags: d.tags || [],
        type: d.type,
        url: d.url,
        slug: d.slug,
        updatedAt: d.updatedAt,
        version: d.version,
      }));

      res.status(200).json({
        success: true,
        data: normalized,
        total: normalized.length,
        message: "Dashboards retrieved successfully",
      });
    } catch (error: any) {
      logGrafana("error", "Dashboards fetch failed", { message: error.message });
      res.status(502).json({
        success: false,
        error: `Failed to connect to Grafana: ${error.message}`,
      });
    }
  }
);

// GET /api/grafana/folders
router.get(
  "/folders",
  authenticate,
  requirePermission("view-projects"),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getGrafanaConfig();
      if (!config.url) {
        res.status(503).json({ success: false, error: "Grafana is not configured" });
        return;
      }

      const headers = buildGrafanaHeaders(config.apiKey);
      const result = await grafanaFetch(`${config.url}/api/folders`, headers);

      if (!result.ok) {
        logGrafana("warn", "Folders API error", { status: result.status });
        res.status(proxyStatus(result.status)).json({
          success: false,
          error: `Grafana API returned ${result.status}`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result.data.map((f: any) => ({
          id: f.id,
          uid: f.uid,
          title: f.title,
          url: f.url,
        })),
        message: "Folders retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/grafana/proxy/*
router.get(
  "/proxy/*",
  authenticate,
  requirePermission("view-projects"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getGrafanaConfig();
      if (!config.url) {
        res.status(503).json({ success: false, error: "Grafana is not configured" });
        return;
      }

      const path = req.params[0];
      // Only allow safe API paths (prevent path traversal)
      if (path.includes("..")) {
        res.status(400).json({ success: false, error: "Invalid path" });
        return;
      }

      const headers = buildGrafanaHeaders(config.apiKey);
      const result = await grafanaFetch(`${config.url}/api/${path}`, headers);

      res
        .status(proxyStatus(result.status))
        .set("Content-Type", "application/json")
        .json(result.data);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
