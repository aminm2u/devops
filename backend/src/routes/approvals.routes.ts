import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../rbac/authorize.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { AppError } from "../lib/errors.js";
import { decideRequest, pendingFor } from "../services/approvalRequest.service.js";
import prisma from "../config/database.js";

/**
 * The Approval Section.
 *
 * Every module writes to one ledger, so this is the only place a person has to
 * look. The default query is strictly personal — `approverId = me`. Seeing
 * someone else's queue requires `approval.request.read.all`, which exists for
 * audit rather than for convenience.
 */

const router = Router();

router.use(authenticate);

const MODULES = [
  "timesheet",
  "requisition",
  "purchase-order",
  "payment",
  "deployment",
  "change",
  "enrollment",
] as const;

/** GET /api/approvals — my queue, grouped-ready. */
router.get(
  "/",
  authorize({ permission: "approval.request.view.own" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const {
        status = "pending",
        module,
        scope = "mine",
        page = "1",
        limit = "50",
      } = req.query;

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));

      // "all" is an audit view, not a convenience: it needs its own grant.
      const canSeeAll =
        req.access!.isSuperAdmin || !!req.access!.permissions["approval.request.read.all"];
      const wantAll = scope === "all";
      if (wantAll && !canSeeAll) {
        throw new AppError(403, "You can only see your own approval queue");
      }

      const where: Record<string, unknown> = {};
      if (!wantAll) where.approverId = req.user!.id;
      if (status !== "any") where.status = status;
      if (module && module !== "all") where.module = module;

      const [requests, total, byModule] = await Promise.all([
        prisma.approvalRequest.findMany({
          where,
          include: {
            requester: { select: { id: true, name: true, email: true } },
            approver: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.approvalRequest.count({ where }),
        // Counts for the tab badges, unaffected by the module filter.
        prisma.approvalRequest.groupBy({
          by: ["module"],
          where: { ...where, module: undefined },
          _count: { _all: true },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: requests.map((request) => ({
          ...request,
          ageHours: Math.floor((Date.now() - request.createdAt.getTime()) / 3_600_000),
        })),
        meta: {
          currentPage: pageNum,
          lastPage: Math.max(1, Math.ceil(total / limitNum)),
          perPage: limitNum,
          total,
          scope: wantAll ? "all" : "mine",
          byModule: Object.fromEntries(byModule.map((row) => [row.module, row._count._all])),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/** GET /api/approvals/summary — badge count for the sidebar and bell. */
router.get(
  "/summary",
  authorize({ permission: "approval.request.view.own" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const pending = await prisma.approvalRequest.count({
        where: { approverId: req.user!.id, status: "pending" },
      });
      res.status(200).json({ success: true, data: { pending } });
    } catch (error) {
      next(error);
    }
  }
);

/** GET /api/approvals/subject/:type/:id — the decision history for one record. */
router.get(
  "/subject/:type/:id",
  authorize({ permission: "approval.request.view.own" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const subjectId = Number(req.params.id);
      if (!Number.isFinite(subjectId)) throw new AppError(400, "Invalid subject id");

      const requests = await prisma.approvalRequest.findMany({
        where: { subjectType: String(req.params.type), subjectId },
        include: {
          requester: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Only the people involved may read the history.
      const involved = requests.some(
        (request) => request.requesterId === req.user!.id || request.approverId === req.user!.id
      );
      if (!involved && !req.access!.isSuperAdmin) {
        throw new AppError(403, "You are not part of this approval");
      }

      res.status(200).json({ success: true, data: requests });
    } catch (error) {
      next(error);
    }
  }
);

const decisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  comment: z.string().max(2000).nullable().optional(),
});

/**
 * POST /api/approvals/:id/decide — approve or reject.
 *
 * `decideRequest` re-checks ownership and pending status inside the service, so
 * two open tabs cannot both succeed.
 */
router.post(
  "/:id/decide",
  authorize({ permission: "approval.request.decide" }),
  validate(decisionSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const requestId = Number(req.params.id);
      if (!Number.isFinite(requestId)) throw new AppError(400, "Invalid request id");
      const { action, comment } = req.body as z.infer<typeof decisionSchema>;

      const result = await decideRequest({
        requestId,
        actorId: req.user!.id,
        action,
        comment: comment ?? null,
      });

      res.status(200).json({
        success: true,
        data: result,
        // A multi-step chain accepts this approval but the record is still
        // `under_review`, so the message must not claim it is finished.
        message:
          action === "approve"
            ? result.subjectStatus === "approved" || result.subjectStatus === "paid" || result.subjectStatus === "in_progress"
              ? "Approved"
              : "Approved — passed to the next approver"
            : "Rejected",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
export { pendingFor };
