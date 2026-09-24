import prisma from "../config/database.js";

let PDFDocument: any;
async function loadPdfKit() {
  if (!PDFDocument) {
    const mod = await import("pdfkit");
    PDFDocument = mod.default;
  }
  return PDFDocument;
}

interface WeeklyReportData {
  totalProjects: number;
  activeProjects: number;
  openIncidents: number;
  criticalIncidents: number;
  deploymentsThisWeek: number;
  completedDeployments: number;
  failedDeployments: number;
  sslExpiringCount: number;
  sslExpiringCertificates: { name: string; notAfter: Date }[];
  recentIncidents: { title: string; severity: string; status: string; createdAt: Date }[];
  recentDeployments: { name: string; status: string; project: string; createdAt: Date }[];
  generatedAt: Date;
  weekStart: Date;
  weekEnd: Date;
}

export async function gatherWeeklyReportData(userId?: number): Promise<WeeklyReportData> {
  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  // Build project filter based on userhahah
  let projectFilter: any = { deletedAt: null };
  let incidentProjectFilter: any = {};
  let deploymentProjectFilter: any = {};
  let sslProjectFilter: any = { isActive: true, deletedAt: null };

  if (userId) {
    // Get projects assigned to user via team assignments
    const assignments = await prisma.teamAssignment.findMany({
      where: { userId, isActive: true },
      select: { projectId: true },
    });
    // Get projects owned by user
    const ownedProjects = await prisma.project.findMany({
      where: { ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    const allProjectIds = [...new Set([...assignments.map((a) => a.projectId), ...ownedProjects.map((p) => p.id)])];

    if (allProjectIds.length > 0) {
      projectFilter.id = { in: allProjectIds };
      incidentProjectFilter.projectId = { in: allProjectIds };
      deploymentProjectFilter.projectId = { in: allProjectIds };
      sslProjectFilter.projectId = { in: allProjectIds };
    } else {
      // User has no projects — return empty data
      return {
        totalProjects: 0,
        activeProjects: 0,
        openIncidents: 0,
        criticalIncidents: 0,
        deploymentsThisWeek: 0,
        completedDeployments: 0,
        failedDeployments: 0,
        sslExpiringCount: 0,
        sslExpiringCertificates: [],
        recentIncidents: [],
        recentDeployments: [],
        generatedAt: now,
        weekStart: oneWeekAgo,
        weekEnd: now,
      };
    }
  }

  const [
    totalProjects,
    activeProjects,
    openIncidents,
    criticalIncidents,
    deploymentsThisWeek,
    completedDeployments,
    failedDeployments,
    sslExpiringCount,
    sslExpiringCertificates,
    recentIncidents,
    recentDeployments,
  ] = await Promise.all([
    prisma.project.count({ where: projectFilter }),
    prisma.project.count({ where: { ...projectFilter, status: "active" } }),
    prisma.incident.count({
      where: { status: { notIn: ["resolved", "closed"] }, deletedAt: null, ...incidentProjectFilter },
    }),
    prisma.incident.count({
      where: { severity: "critical", status: { notIn: ["resolved", "closed"] }, deletedAt: null, ...incidentProjectFilter },
    }),
    prisma.deployment.count({
      where: { createdAt: { gte: oneWeekAgo }, ...deploymentProjectFilter },
    }),
    prisma.deployment.count({
      where: { status: "completed", createdAt: { gte: oneWeekAgo }, ...deploymentProjectFilter },
    }),
    prisma.deployment.count({
      where: { status: "failed", createdAt: { gte: oneWeekAgo }, ...deploymentProjectFilter },
    }),
    prisma.sslCertificate.count({
      where: { notAfter: { lte: thirtyDaysFromNow }, ...sslProjectFilter },
    }),
    prisma.sslCertificate.findMany({
      where: { notAfter: { lte: thirtyDaysFromNow }, ...sslProjectFilter },
      select: { name: true, notAfter: true },
      orderBy: { notAfter: "asc" },
      take: 10,
    }),
    prisma.incident.findMany({
      where: { deletedAt: null, ...incidentProjectFilter },
      select: { title: true, severity: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.deployment.findMany({
      where: { createdAt: { gte: oneWeekAgo }, ...deploymentProjectFilter },
      select: {
        name: true,
        status: true,
        createdAt: true,
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    totalProjects,
    activeProjects,
    openIncidents,
    criticalIncidents,
    deploymentsThisWeek,
    completedDeployments,
    failedDeployments,
    sslExpiringCount,
    sslExpiringCertificates: sslExpiringCertificates.map((c) => ({
      name: c.name,
      notAfter: c.notAfter,
    })),
    recentIncidents: recentIncidents.map((i) => ({
      title: i.title,
      severity: i.severity,
      status: i.status,
      createdAt: i.createdAt,
    })),
    recentDeployments: recentDeployments.map((d) => ({
      name: d.name,
      status: d.status,
      project: d.project?.name || "Unknown",
      createdAt: d.createdAt,
    })),
    generatedAt: now,
    weekStart: oneWeekAgo,
    weekEnd: now,
  };
}

// ── Helper: Draw rounded rectangle with fill ────────────────────────────────
function drawRoundedRect(doc: any, x: number, y: number, w: number, h: number, r: number, fillColor: string) {
  doc.save();
  doc.fill(fillColor);
  doc.roundedRect(x, y, w, h, r).fill();
  doc.restore();
}

// ── Helper: Draw badge ─────────────────────────────────────────────────────
function drawBadge(doc: any, x: number, y: number, text: string, bgColor: string, textColor: string = "#ffffff") {
  const padding = 6;
  doc.font("Helvetica-Bold").fontSize(7);
  const textWidth = doc.widthOfString(text.toUpperCase());
  const badgeWidth = textWidth + padding * 2;
  const badgeHeight = 14;

  doc.save();
  doc.fill(bgColor);
  doc.roundedRect(x, y, badgeWidth, badgeHeight, 3).fill();
  doc.fill(textColor).text(text.toUpperCase(), x + padding, y + 3, {
    width: badgeWidth - padding * 2,
    align: "center",
  });
  doc.restore();

  return badgeWidth;
}

// ── Helper: Draw section title ─────────────────────────────────────────────
function drawSectionTitle(doc: any, title: string, y: number, pageWidth: number): number {
  doc.save();
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#1e293b");
  doc.text(title, 50, y);
  y += 18;
  // Accent line
  doc.save();
  doc.fill("#3b82f6");
  doc.rect(50, y, 40, 3).fill();
  doc.restore();
  y += 12;
  doc.restore();
  return y;
}

// ── Helper: Draw table row background ──────────────────────────────────────
function drawTableRowBg(doc: any, x: number, y: number, width: number, height: number, isEven: boolean) {
  doc.save();
  doc.fill(isEven ? "#f8fafc" : "#ffffff");
  doc.rect(x, y, width, height).fill();
  doc.restore();
}

export async function generateWeeklyReportPDF(data: WeeklyReportData): Promise<Buffer> {
  const PDFDoc = await loadPdfKit();

  return new Promise((resolve, reject) => {
    const doc = new PDFDoc({
      size: "A4",
      margin: 0,
      bufferPages: true,
      info: {
        Title: "DevOps Platform - Weekly Report",
        Author: "MyWorkPortal2.0",
        Subject: "Weekly Platform Report",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_WIDTH = doc.page.width;
    const PAGE_HEIGHT = doc.page.height;
    const MARGIN = 50;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

    const C = {
      primary: "#1e40af",
      primaryLight: "#dbeafe",
      success: "#16a34a",
      successLight: "#dcfce7",
      danger: "#dc2626",
      dangerLight: "#fee2e2",
      warning: "#d97706",
      warningLight: "#fef3c7",
      info: "#0891b2",
      infoLight: "#cffafe",
      dark: "#0f172a",
      darkGray: "#1e293b",
      gray: "#334155",
      muted: "#64748b",
      light: "#f8fafc",
      lighter: "#f1f5f9",
      border: "#e2e8f0",
      borderLight: "#f1f5f9",
    };

    const severityColors: Record<string, { bg: string; text: string }> = {
      low: { bg: "#dcfce7", text: "#166534" },
      medium: { bg: "#fef3c7", text: "#92400e" },
      high: { bg: "#ffedd5", text: "#9a3412" },
      critical: { bg: "#fee2e2", text: "#991b1b" },
    };

    const statusColors: Record<string, { bg: string; text: string }> = {
      completed: { bg: "#dcfce7", text: "#166534" },
      failed: { bg: "#fee2e2", text: "#991b1b" },
      running: { bg: "#dbeafe", text: "#1e40af" },
      pending: { bg: "#fef3c7", text: "#92400e" },
      open: { bg: "#fee2e2", text: "#991b1b" },
      investigating: { bg: "#fef3c7", text: "#92400e" },
      identified: { bg: "#dbeafe", text: "#1e40af" },
      monitoring: { bg: "#e0e7ff", text: "#3730a3" },
      resolved: { bg: "#dcfce7", text: "#166534" },
      closed: { bg: "#f1f5f9", text: "#475569" },
    };

    const formatDate = (d: Date) =>
      new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

    const formatDateTime = (d: Date) =>
      new Date(d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

    // ══════════════════════════════════════════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════════════════════════════════════════
    const headerHeight = 100;

    // Dark background
    doc.save();
    doc.fill("#0f172a");
    doc.rect(0, 0, PAGE_WIDTH, headerHeight).fill();
    doc.restore();

    // Accent bar at bottom of header
    doc.save();
    doc.fill("#3b82f6");
    doc.rect(0, headerHeight - 4, PAGE_WIDTH, 4).fill();
    doc.restore();

    // Title
    doc.save();
    doc.font("Helvetica-Bold").fontSize(26).fillColor("#ffffff");
    doc.text("WEEKLY REPORT", MARGIN, 28, { width: CONTENT_WIDTH });

    // Date range
    doc.font("Helvetica").fontSize(11).fillColor("#94a3b8");
    doc.text(
      `${formatDate(data.weekStart)}  —  ${formatDate(data.weekEnd)}`,
      MARGIN,
      62,
      { width: CONTENT_WIDTH }
    );

    // Generated timestamp
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    doc.text(`Generated: ${formatDateTime(data.generatedAt)}`, MARGIN, 78, {
      width: CONTENT_WIDTH,
    });
    doc.restore();

    let y = headerHeight + 25;

    // ══════════════════════════════════════════════════════════════════════════
    // PLATFORM OVERVIEW CARDS
    // ══════════════════════════════════════════════════════════════════════════
    y = drawSectionTitle(doc, "Platform Overview", y, PAGE_WIDTH);

    const cards = [
      { label: "Total Projects", value: data.totalProjects, icon: "📁", color: C.primary, lightColor: C.primaryLight },
      { label: "Active Projects", value: data.activeProjects, icon: "✅", color: C.success, lightColor: C.successLight },
      { label: "Open Incidents", value: data.openIncidents, icon: "🚨", color: data.openIncidents > 0 ? C.danger : C.success, lightColor: data.openIncidents > 0 ? C.dangerLight : C.successLight },
      { label: "Deployments", value: data.deploymentsThisWeek, icon: "🚀", color: C.info, lightColor: C.infoLight },
      { label: "SSL Expiring", value: data.sslExpiringCount, icon: "🔒", color: data.sslExpiringCount > 0 ? C.warning : C.success, lightColor: data.sslExpiringCount > 0 ? C.warningLight : C.successLight },
    ];

    const cardWidth = (CONTENT_WIDTH - 16 * 4) / 5;
    const cardHeight = 65;
    let cardX = MARGIN;

    for (const card of cards) {
      // Card background
      drawRoundedRect(doc, cardX, y, cardWidth, cardHeight, 6, "#ffffff");
      // Card border
      doc.save();
      doc.strokeColor(C.border).lineWidth(0.5);
      doc.roundedRect(cardX, y, cardWidth, cardHeight, 6).stroke();
      doc.restore();
      // Top accent
      doc.save();
      doc.fill(card.color);
      doc.rect(cardX + 1, y + 1, cardWidth - 2, 3).fill();
      doc.restore();
      // Value
      doc.save();
      doc.font("Helvetica-Bold").fontSize(22).fillColor(C.darkGray);
      doc.text(card.value.toString(), cardX + 10, y + 16, { width: cardWidth - 20 });
      // Label
      doc.font("Helvetica").fontSize(8).fillColor(C.muted);
      doc.text(card.label, cardX + 10, y + 44, { width: cardWidth - 20 });
      doc.restore();
      cardX += cardWidth + 16;
    }
    y += cardHeight + 25;

    // ══════════════════════════════════════════════════════════════════════════
    // DEPLOYMENT SUMMARY BAR
    // ══════════════════════════════════════════════════════════════════════════
    drawRoundedRect(doc, MARGIN, y, CONTENT_WIDTH, 45, 6, "#f8fafc");
    doc.save();
    doc.strokeColor(C.border).lineWidth(0.5);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 45, 6).stroke();
    doc.restore();

    doc.save();
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.darkGray);
    doc.text("Deployment Summary", MARGIN + 15, y + 10);
    doc.font("Helvetica").fontSize(9).fillColor(C.muted);
    doc.text(
      `Total: ${data.deploymentsThisWeek}    |    Completed: ${data.completedDeployments}    |    Failed: ${data.failedDeployments}`,
      MARGIN + 15,
      y + 26
    );
    doc.restore();
    y += 60;

    // ══════════════════════════════════════════════════════════════════════════
    // RECENT INCIDENTS TABLE
    // ══════════════════════════════════════════════════════════════════════════
    if (data.recentIncidents.length > 0) {
      if (y > PAGE_HEIGHT - 200) {
        doc.addPage();
        y = 50;
      }

      y = drawSectionTitle(doc, "Recent Incidents", y, PAGE_WIDTH);

      // Table header
      const tableX = MARGIN;
      const colWidths = [220, 70, 80, 90];

      doc.save();
      doc.fill(C.darkGray);
      doc.roundedRect(tableX, y, CONTENT_WIDTH, 22, 4).fill();
      doc.restore();

      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
      doc.text("TITLE", tableX + 10, y + 7, { width: colWidths[0] });
      doc.text("SEVERITY", tableX + 10 + colWidths[0], y + 7, { width: colWidths[1] });
      doc.text("STATUS", tableX + 10 + colWidths[0] + colWidths[1], y + 7, { width: colWidths[2] });
      doc.text("DATE", tableX + 10 + colWidths[0] + colWidths[1] + colWidths[2], y + 7, { width: colWidths[3] });
      doc.restore();
      y += 22;

      let rowIdx = 0;
      for (const incident of data.recentIncidents.slice(0, 8)) {
        if (y > PAGE_HEIGHT - 80) {
          doc.addPage();
          y = 50;
        }

        const rowHeight = 24;

        // Row background (alternating)
        drawTableRowBg(doc, tableX, y, CONTENT_WIDTH, rowHeight, rowIdx % 2 === 0);

        // Bottom border
        doc.save();
        doc.strokeColor(C.borderLight).lineWidth(0.3);
        doc.moveTo(tableX, y + rowHeight).lineTo(tableX + CONTENT_WIDTH, y + rowHeight).stroke();
        doc.restore();

        // Content
        doc.save();
        doc.font("Helvetica").fontSize(8).fillColor(C.darkGray);
        doc.text(incident.title, tableX + 10, y + 7, { width: colWidths[0] - 5, ellipsis: true });

        // Severity badge
        const sev = severityColors[incident.severity] || { bg: "#f1f5f9", text: "#475569" };
        drawBadge(doc, tableX + 10 + colWidths[0], y + 5, incident.severity, sev.bg, sev.text);

        // Status badge
        const stat = statusColors[incident.status] || { bg: "#f1f5f9", text: "#475569" };
        drawBadge(doc, tableX + 10 + colWidths[0] + colWidths[1], y + 5, incident.status, stat.bg, stat.text);

        doc.font("Helvetica").fontSize(8).fillColor(C.muted);
        doc.text(
          formatDate(incident.createdAt),
          tableX + 10 + colWidths[0] + colWidths[1] + colWidths[2],
          y + 7,
          { width: colWidths[3] }
        );
        doc.restore();

        y += rowHeight;
        rowIdx++;
      }
      y += 20;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // RECENT DEPLOYMENTS TABLE
    // ══════════════════════════════════════════════════════════════════════════
    if (data.recentDeployments.length > 0) {
      if (y > PAGE_HEIGHT - 200) {
        doc.addPage();
        y = 50;
      }

      y = drawSectionTitle(doc, "Recent Deployments", y, PAGE_WIDTH);

      const tableX = MARGIN;
      const colWidths = [180, 140, 80, 100];

      // Table header
      doc.save();
      doc.fill(C.darkGray);
      doc.roundedRect(tableX, y, CONTENT_WIDTH, 22, 4).fill();
      doc.restore();

      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
      doc.text("NAME", tableX + 10, y + 7, { width: colWidths[0] });
      doc.text("PROJECT", tableX + 10 + colWidths[0], y + 7, { width: colWidths[1] });
      doc.text("STATUS", tableX + 10 + colWidths[0] + colWidths[1], y + 7, { width: colWidths[2] });
      doc.text("DATE", tableX + 10 + colWidths[0] + colWidths[1] + colWidths[2], y + 7, { width: colWidths[3] });
      doc.restore();
      y += 22;

      let rowIdx = 0;
      for (const deploy of data.recentDeployments.slice(0, 8)) {
        if (y > PAGE_HEIGHT - 80) {
          doc.addPage();
          y = 50;
        }

        const rowHeight = 24;

        drawTableRowBg(doc, tableX, y, CONTENT_WIDTH, rowHeight, rowIdx % 2 === 0);

        doc.save();
        doc.strokeColor(C.borderLight).lineWidth(0.3);
        doc.moveTo(tableX, y + rowHeight).lineTo(tableX + CONTENT_WIDTH, y + rowHeight).stroke();
        doc.restore();

        doc.save();
        doc.font("Helvetica").fontSize(8).fillColor(C.darkGray);
        doc.text(deploy.name, tableX + 10, y + 7, { width: colWidths[0] - 5, ellipsis: true });
        doc.fillColor(C.muted);
        doc.text(deploy.project, tableX + 10 + colWidths[0], y + 7, { width: colWidths[1] - 5, ellipsis: true });

        const stat = statusColors[deploy.status] || { bg: "#f1f5f9", text: "#475569" };
        drawBadge(doc, tableX + 10 + colWidths[0] + colWidths[1], y + 5, deploy.status, stat.bg, stat.text);

        doc.font("Helvetica").fontSize(8).fillColor(C.muted);
        doc.text(
          formatDate(deploy.createdAt),
          tableX + 10 + colWidths[0] + colWidths[1] + colWidths[2],
          y + 7,
          { width: colWidths[3] }
        );
        doc.restore();

        y += rowHeight;
        rowIdx++;
      }
      y += 20;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SSL CERTIFICATES EXPIRING
    // ══════════════════════════════════════════════════════════════════════════
    if (data.sslExpiringCertificates.length > 0) {
      if (y > PAGE_HEIGHT - 200) {
        doc.addPage();
        y = 50;
      }

      y = drawSectionTitle(doc, "SSL Certificates Expiring Soon", y, PAGE_WIDTH);

      const tableX = MARGIN;
      const colWidths = [320, 180];

      // Table header
      doc.save();
      doc.fill(C.darkGray);
      doc.roundedRect(tableX, y, CONTENT_WIDTH, 22, 4).fill();
      doc.restore();

      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
      doc.text("CERTIFICATE", tableX + 10, y + 7, { width: colWidths[0] });
      doc.text("EXPIRES", tableX + 10 + colWidths[0], y + 7, { width: colWidths[1] });
      doc.restore();
      y += 22;

      let rowIdx = 0;
      for (const cert of data.sslExpiringCertificates.slice(0, 10)) {
        if (y > PAGE_HEIGHT - 80) {
          doc.addPage();
          y = 50;
        }

        const rowHeight = 24;

        drawTableRowBg(doc, tableX, y, CONTENT_WIDTH, rowHeight, rowIdx % 2 === 0);

        doc.save();
        doc.strokeColor(C.borderLight).lineWidth(0.3);
        doc.moveTo(tableX, y + rowHeight).lineTo(tableX + CONTENT_WIDTH, y + rowHeight).stroke();
        doc.restore();

        doc.save();
        doc.font("Helvetica").fontSize(8).fillColor(C.darkGray);
        doc.text(cert.name, tableX + 10, y + 7, { width: colWidths[0] - 5, ellipsis: true });

        // Expiring soon = orange, already expired = red
        const expDate = new Date(cert.notAfter);
        const isExpired = expDate < new Date();
        doc.fillColor(isExpired ? C.danger : C.warning);
        doc.text(
          formatDate(cert.notAfter),
          tableX + 10 + colWidths[0],
          y + 7,
          { width: colWidths[1] }
        );
        doc.restore();

        y += rowHeight;
        rowIdx++;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════════════════════
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);

      // Footer line
      doc.save();
      doc.strokeColor(C.border).lineWidth(0.5);
      doc.moveTo(MARGIN, PAGE_HEIGHT - 35).lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 35).stroke();
      doc.restore();

      // Footer text
      doc.save();
      doc.font("Helvetica").fontSize(7).fillColor(C.muted);
      doc.text(
        "MyWorkPortal2.0  •  Weekly Report",
        MARGIN,
        PAGE_HEIGHT - 28,
        { width: CONTENT_WIDTH / 2 }
      );
      doc.text(
        `Page ${i + 1} of ${pageCount}`,
        PAGE_WIDTH / MARGIN,
        PAGE_HEIGHT - 28,
        { width: CONTENT_WIDTH / 2, align: "right" }
      );
      doc.restore();
    }

    doc.end();
  });
}
