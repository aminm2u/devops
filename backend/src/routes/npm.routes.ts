import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { X509Certificate } from "crypto";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import axios from "axios";

const router = Router();

// NPM Configuration storage (using Settings model)
const NPM_CONFIG_KEY = "nginx_proxy_manager";

interface NpmConfig {
  url: string;
  apiToken: string;
  userId: number;
  enabled: boolean;
}

async function getNpmConfig(): Promise<NpmConfig | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: NPM_CONFIG_KEY },
  });
  if (!setting) return null;
  try {
    return JSON.parse(setting.value) as NpmConfig;
  } catch {
    console.error("[NPM] Failed to parse config from database");
    return null;
  }
}

async function saveNpmConfig(config: NpmConfig) {
  await prisma.setting.upsert({
    where: { key: NPM_CONFIG_KEY },
    update: { value: JSON.stringify(config) },
    create: { key: NPM_CONFIG_KEY, value: JSON.stringify(config) },
  });
}

async function npmApiGet(endpoint: string, config: NpmConfig) {
  const response = await axios.get(`${config.url}/api${endpoint}`, {
    headers: {
      "Authorization": `Bearer ${config.apiToken}`,
      "Accept": "application/json",
    },
  });
  return response.data;
}

/**
 * Extract notBefore/notAfter dates from a PEM certificate string.
 * NPM stores the actual cert in meta.letsencrypt.cert (or meta.letsencrypt.json.cert).
 */
function extractDatesFromPem(pem: string): { notBefore: Date | null; notAfter: Date | null } {
  try {
    const x509 = new X509Certificate(pem);
    return {
      notBefore: new Date(x509.validFrom),
      notAfter: new Date(x509.validTo),
    };
  } catch {
    return { notBefore: null, notAfter: null };
  }
}

/**
 * Get the PEM certificate string from the NPM certificate object.
 * Handles various NPM API response structures.
 */
function getPemFromCert(cert: any): string | null {
  // Path 1: meta.letsencrypt.cert (most common for LE certs)
  if (cert.meta?.letsencrypt?.cert) return cert.meta.letsencrypt.cert;
  // Path 2: meta.letsencrypt.json.cert
  if (cert.meta?.letsencrypt?.json?.cert) return cert.meta.letsencrypt.json.cert;
  // Path 3: meta.commercial.cert
  if (cert.meta?.commercial?.cert) return cert.meta.commercial.cert;
  // Path 4: meta.custom.cert
  if (cert.meta?.custom?.cert) return cert.meta.custom.cert;
  // Path 5: certificate field (some NPM versions)
  if (cert.certificate && typeof cert.certificate === "string" && cert.certificate.includes("BEGIN CERTIFICATE")) return cert.certificate;
  // Path 6: meta.nginx_proxy.hosts — contains the full PEM
  if (cert.meta?.nginx_proxy?.hosts) {
    const hosts = cert.meta.nginx_proxy.hosts;
    if (typeof hosts === "string" && hosts.includes("BEGIN CERTIFICATE")) return hosts;
  }
  // Path 7: meta.nginx_proxy.certificate
  if (cert.meta?.nginx_proxy?.certificate) {
    const certStr = typeof cert.meta.nginx_proxy.certificate === "string"
      ? cert.meta.nginx_proxy.certificate
      : cert.meta.nginx_proxy.certificate.cert;
    if (certStr && certStr.includes("BEGIN CERTIFICATE")) return certStr;
  }
  // Path 8: Recursively search meta for any string containing BEGIN CERTIFICATE
  if (cert.meta) {
    const found = findPemInObject(cert.meta);
    if (found) return found;
  }
  return null;
}

/**
 * Recursively search an object for a PEM string
 */
function findPemInObject(obj: any, depth = 0): string | null {
  if (depth > 5) return null;
  if (typeof obj === "string" && obj.includes("BEGIN CERTIFICATE")) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findPemInObject(item, depth + 1);
      if (found) return found;
    }
  }
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      const found = findPemInObject(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// POST /api/npm/config - Save NPM configuration
router.post(
  "/config",
  authenticate,
  requirePermission("update-settings"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { url, apiToken, userId } = req.body;

      // Test connection
      try {
        await axios.get(`${url}/api/nginx/proxy-hosts`, {
          headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Accept": "application/json",
          },
          timeout: 5000,
        });
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          message: `Failed to connect to NPM: ${err.message}`,
        });
      }

      await saveNpmConfig({ url, apiToken, userId, enabled: true });

      await logActivity({
        description: "Nginx Proxy Manager configuration saved",
        subjectType: "App\\Models\\Setting",
        subjectId: 1,
        event: "updated",
        causerId: req.user!.id,
        properties: { url },
      });

      res.status(200).json({
        success: true,
        message: "NPM configuration saved and connection verified",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/npm/config - Get NPM configuration
router.get(
  "/config",
  authenticate,
  requirePermission("update-settings"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getNpmConfig();
      res.status(200).json({
        success: true,
        data: config ? { ...config, apiToken: "••••••••" } : null,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/npm/sync - Sync certificates from NPM
router.post(
  "/sync",
  authenticate,
  requirePermission("create-ssl-certificates"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getNpmConfig();
      if (!config || !config.enabled) {
        return res.status(400).json({
          success: false,
          message: "NPM not configured. Please configure it in Settings.",
        });
      }

      // Get proxy hosts with certificates from NPM
      const proxyHosts = await npmApiGet(
        "/nginx/proxy-hosts?expand=owner,access_list,certificate",
        config
      );

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const host of proxyHosts) {
        if (!host.certificate || !host.certificate.id) {
          skipped++;
          continue;
        }

        const cert = host.certificate;
        const domainName = host.domain_names?.[0] || host.forward_host;

        // Log certificate structure for debugging (first few only)
        if (imported + updated < 3) {
          const pem = getPemFromCert(cert);
          console.log("[NPM Sync] Certificate structure:", {
            domain: domainName,
            certId: cert.id,
            certProvider: cert.provider,
            certKeys: Object.keys(cert),
            metaKeys: cert.meta ? Object.keys(cert.meta) : null,
            metaLetsencryptKeys: cert.meta?.letsencrypt ? Object.keys(cert.meta.letsencrypt) : null,
            hasPem: !!pem,
            pemPreview: pem ? pem.substring(0, 100) + "..." : null,
            expires_on: cert.expires_on,
            created_on: cert.created_on,
          });
        }

        // Extract dates from PEM certificate (most reliable source)
        const pem = getPemFromCert(cert);
        const pemDates = pem ? extractDatesFromPem(pem) : { notBefore: null, notAfter: null };

        // Fallback to top-level fields if PEM parsing fails
        const notBefore = pemDates.notBefore || (cert.created_on ? new Date(cert.created_on) : null);
        const notAfter = pemDates.notAfter || (cert.expires_on ? new Date(cert.expires_on) : null);

        // Log warning if no dates found
        if (!notAfter && imported + updated < 3) {
          console.warn("[NPM Sync] No expiry date found for:", {
            domain: domainName,
            certId: cert.id,
            meta: cert.meta,
          });
        }

        // Check if certificate already exists
        const existing = await prisma.sslCertificate.findFirst({
          where: {
            name: `NPM: ${domainName}`,
            deletedAt: null,
          },
        });

        if (existing) {
          // Update existing certificate - only update dates if we have new ones
          const updateData: any = {
            issuer: cert.provider || "Nginx Proxy Manager",
            serialNumber: cert.serial_number || null,
            fingerprint: cert.fingerprint || null,
            isActive: true,
            status: "valid",
          };

          // Only update dates if we have new values
          if (notBefore) updateData.notBefore = notBefore;
          if (notAfter) updateData.notAfter = notAfter;

          // If still no dates, try fetching from NPM certificate endpoint
          if (!notAfter && cert.id) {
            try {
              const certDetails = await npmApiGet(`/nginx/certificates/${cert.id}`, config);
              if (certDetails) {
                const certPem = getPemFromCert(certDetails);
                if (certPem) {
                  const certDates = extractDatesFromPem(certPem);
                  if (certDates.notBefore) updateData.notBefore = certDates.notBefore;
                  if (certDates.notAfter) updateData.notAfter = certDates.notAfter;
                }
              }
            } catch (e) {
              // Ignore errors - NPM might not have this endpoint
            }
          }

          await prisma.sslCertificate.update({
            where: { id: existing.id },
            data: updateData,
          });
          updated++;
        } else {
          // Find or use first project
          const project = await prisma.project.findFirst({
            where: { deletedAt: null },
          });

          if (!project) {
            skipped++;
            continue;
          }

          // Create new certificate record
          await prisma.sslCertificate.create({
            data: {
              projectId: project.id,
              name: `NPM: ${domainName}`,
              type: cert.provider === "letsencrypt" ? "letsencrypt" : "commercial",
              issuer: cert.provider || "Nginx Proxy Manager",
              serialNumber: cert.serial_number || null,
              notBefore,
              notAfter,
              fingerprint: cert.fingerprint || null,
              autoRenew: true,
              isActive: true,
              status: "valid",
            },
          });
          imported++;
        }
      }

      await logActivity({
        description: `NPM sync completed: ${imported} imported, ${updated} updated, ${skipped} skipped`,
        subjectType: "App\\Models\\SslCertificate",
        subjectId: 1,
        event: "synced",
        causerId: req.user!.id,
        properties: { imported, updated, skipped },
      });

      res.status(200).json({
        success: true,
        data: { imported, updated, skipped },
        message: `Sync complete: ${imported} imported, ${updated} updated, ${skipped} skipped`,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/npm/sync-domains - Sync domains from NPM proxy hosts
router.post(
  "/sync-domains",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getNpmConfig();
      if (!config || !config.enabled) {
        return res.status(400).json({
          success: false,
          message: "NPM not configured. Please configure it in Settings.",
        });
      }

      // Get proxy hosts with certificates from NPM
      let proxyHosts;
      try {
        proxyHosts = await npmApiGet(
          "/nginx/proxy-hosts?expand=certificate",
          config
        );
      } catch (apiError: any) {
        const statusCode = apiError.response?.status || 500;
        const npmError = apiError.response?.data?.error || apiError.message;
        return res.status(statusCode).json({
          success: false,
          message: `NPM API error (${statusCode}): ${typeof npmError === 'object' ? JSON.stringify(npmError) : npmError}`,
        });
      }

      // Also get redirectional hosts
      const redirectHosts = await npmApiGet(
        "/nginx/redirection-hosts",
        config
      ).catch(() => []);

      // Also get dead hosts (no certificate)
      const deadHosts = await npmApiGet(
        "/nginx/dead-hosts",
        config
      ).catch(() => []);

      // Find or use first project
      const project = await prisma.project.findFirst({
        where: { deletedAt: null },
      });

      if (!project) {
        return res.status(400).json({
          success: false,
          message: "No project found. Please create a project first.",
        });
      }

      // Collect all unique domain names from all host types
      const domainMap = new Map<string, { type: string; hasCert: boolean; host: any }>();

      // Proxy hosts (have certificates)
      for (const host of proxyHosts) {
        for (const domainName of host.domain_names || []) {
          if (!domainMap.has(domainName)) {
            domainMap.set(domainName, {
              type: "primary",
              hasCert: !!host.certificate?.id,
              host,
            });
          }
        }
      }

      // Redirect hosts
      for (const host of redirectHosts) {
        for (const domainName of host.domain_names || []) {
          if (!domainMap.has(domainName)) {
            domainMap.set(domainName, {
              type: "redirect",
              hasCert: false,
              host,
            });
          }
        }
      }

      // Dead hosts
      for (const host of deadHosts) {
        for (const domainName of host.domain_names || []) {
          if (!domainMap.has(domainName)) {
            domainMap.set(domainName, {
              type: "dead",
              hasCert: false,
              host,
            });
          }
        }
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const [domainName, info] of domainMap) {
        // Skip wildcard entries and IP addresses
        if (domainName.startsWith("*") || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domainName)) {
          skipped++;
          continue;
        }

        // Extract cert expiry if available
        let expirationDate: Date | null = null;
        let certProvider: string | null = null;

        if (info.host.certificate) {
          certProvider = info.host.certificate.provider || null;

          // Try to get PEM from the certificate object
          const pem = getPemFromCert(info.host.certificate);
          if (pem) {
            const dates = extractDatesFromPem(pem);
            expirationDate = dates.notAfter;
          }

          // If no dates, try fetching certificate details from NPM
          if (!expirationDate && info.host.certificate.id) {
            try {
              const certDetails = await npmApiGet(`/nginx/certificates/${info.host.certificate.id}`, config);
              if (certDetails) {
                const certPem = getPemFromCert(certDetails);
                if (certPem) {
                  const certDates = extractDatesFromPem(certPem);
                  if (certDates.notAfter) expirationDate = certDates.notAfter;
                }
                // Also try meta.letsencrypt.json.cert_chain
                if (!expirationDate && certDetails.meta?.letsencrypt?.json?.cert) {
                  const chainPem = certDetails.meta.letsencrypt.json.cert;
                  if (chainPem) {
                    const chainDates = extractDatesFromPem(chainPem);
                    if (chainDates.notAfter) expirationDate = chainDates.notAfter;
                  }
                }
              }
            } catch (e) {
              // Ignore - NPM might not have this endpoint
            }
          }
        }

        // Check if domain already exists
        const existing = await prisma.domain.findFirst({
          where: {
            name: domainName,
            deletedAt: null,
          },
        });

        if (existing) {
          // Update existing domain
          await prisma.domain.update({
            where: { id: existing.id },
            data: {
              status: "active",
              expirationDate: expirationDate || existing.expirationDate,
              autoRenew: info.host.certificate?.provider === "letsencrypt",
              isActive: true,
              metadata: {
                npmType: info.type,
                npmHostId: info.host.id,
                forwardHost: info.host.forward_host,
                forwardPort: info.host.forward_port,
                certificateId: info.host.certificate?.id || null,
                certificateProvider: info.host.certificate?.provider || null,
              },
            },
          });
          updated++;
        } else {
          // Create new domain
          await prisma.domain.create({
            data: {
              projectId: project.id,
              name: domainName,
              type: info.type,
              status: "active",
              registrar: "Nginx Proxy Manager",
              expirationDate,
              autoRenew: info.host.certificate?.provider === "letsencrypt",
              isActive: true,
              metadata: {
                npmType: info.type,
                npmHostId: info.host.id,
                forwardHost: info.host.forward_host,
                forwardPort: info.host.forward_port,
                certificateId: info.host.certificate?.id || null,
                certificateProvider: info.host.certificate?.provider || null,
              },
            },
          });
          imported++;
        }
      }

      await logActivity({
        description: `NPM domain sync completed: ${imported} imported, ${updated} updated, ${skipped} skipped`,
        subjectType: "App\\Models\\Domain",
        subjectId: 1,
        event: "synced",
        causerId: req.user!.id,
        properties: { imported, updated, skipped },
      });

      res.status(200).json({
        success: true,
        data: { imported, updated, skipped },
        message: `Domain sync complete: ${imported} imported, ${updated} updated, ${skipped} skipped`,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/npm/debug/certificates - Debug endpoint to see raw NPM certificate data
router.get(
  "/debug/certificates",
  authenticate,
  requirePermission("update-settings"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getNpmConfig();
      if (!config || !config.enabled) {
        return res.status(400).json({
          success: false,
          message: "NPM not configured",
        });
      }

      const proxyHosts = await npmApiGet(
        "/nginx/proxy-hosts?expand=certificate",
        config
      );

      // Return first 3 hosts with full certificate details
      const debug = proxyHosts.slice(0, 3).map((host: any) => ({
        domain: host.domain_names?.[0],
        hostId: host.id,
        certificate: host.certificate ? {
          id: host.certificate.id,
          provider: host.certificate.provider,
          created_on: host.certificate.created_on,
          expires_on: host.certificate.expires_on,
          metaKeys: host.certificate.meta ? Object.keys(host.certificate.meta) : null,
          meta: host.certificate.meta,
        } : null,
      }));

      res.status(200).json({
        success: true,
        data: debug,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/npm/proxy-hosts - Get proxy hosts from NPM
router.get(
  "/proxy-hosts",
  authenticate,
  requirePermission("view-ssl-certificates"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getNpmConfig();
      if (!config || !config.enabled) {
        return res.status(400).json({
          success: false,
          message: "NPM not configured",
        });
      }

      const hosts = await npmApiGet(
        "/nginx/proxy-hosts?expand=certificate",
        config
      );

      res.status(200).json({
        success: true,
        data: hosts,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/npm/test - Test NPM connection
router.post(
  "/test",
  authenticate,
  requirePermission("update-settings"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getNpmConfig();
      if (!config) {
        return res.status(400).json({
          success: false,
          message: "NPM not configured",
        });
      }

      await npmApiGet("/nginx/proxy-hosts", config);

      res.status(200).json({
        success: true,
        message: "Connection successful",
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Connection failed: ${error.message}`,
      });
    }
  }
);

export default router;
