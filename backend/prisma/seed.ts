import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clean existing data (order matters for foreign keys)
  await prisma.document.deleteMany();
  await prisma.securityFinding.deleteMany();
  await prisma.disasterRecoveryPlan.deleteMany();
  await prisma.backupJob.deleteMany();
  await prisma.changeManagement.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.deployment.deleteMany();
  await prisma.sslCertificate.deleteMany();
  await prisma.domain.deleteMany();
  await prisma.application.deleteMany();
  await prisma.service.deleteMany();
  await prisma.infrastructureNode.deleteMany();
  await prisma.teamAssignment.deleteMany();
  await prisma.environment.deleteMany();
  await prisma.project.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.roleHasPermission.deleteMany();
  await prisma.modelHasRole.deleteMany();
  await prisma.modelHasPermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();

  // ==================== Create Roles ====================
  console.log("Creating roles...");

  const superAdminRole = await prisma.role.create({
    data: {
      name: "super-admin",
      guardName: "web",
      description: "Full system access",
    },
  });

  const devopsAdminRole = await prisma.role.create({
    data: {
      name: "devops-admin",
      guardName: "web",
      description: "Manage projects and operational information",
    },
  });

  const devopsEngineerRole = await prisma.role.create({
    data: {
      name: "devops-engineer",
      guardName: "web",
      description: "Manage assigned projects and operational records",
    },
  });

  const viewerRole = await prisma.role.create({
    data: {
      name: "viewer",
      guardName: "web",
      description: "Read-only access",
    },
  });

  // ==================== Create Permissions ====================
  console.log("Creating permissions...");

  const permissionNames = [
    // Project permissions
    "view-projects",
    "create-projects",
    "update-projects",
    "delete-projects",
    // Environment permissions
    "view-environments",
    "create-environments",
    "update-environments",
    "delete-environments",
    // Infrastructure permissions
    "view-infrastructure",
    "create-infrastructure",
    "update-infrastructure",
    "delete-infrastructure",
    // Service permissions
    "view-services",
    "create-services",
    "update-services",
    "delete-services",
    // Application permissions
    "view-applications",
    "create-applications",
    "update-applications",
    "delete-applications",
    // Domain permissions
    "view-domains",
    "create-domains",
    "update-domains",
    "delete-domains",
    // SSL permissions
    "view-ssl-certificates",
    "create-ssl-certificates",
    "update-ssl-certificates",
    "delete-ssl-certificates",
    // Deployment permissions
    "view-deployments",
    "create-deployments",
    "update-deployments",
    "delete-deployments",
    // Incident permissions
    "view-incidents",
    "create-incidents",
    "update-incidents",
    "delete-incidents",
    // Change management permissions
    "view-changes",
    "create-changes",
    "update-changes",
    "delete-changes",
    // Backup permissions
    "view-backup-jobs",
    "create-backup-jobs",
    "update-backup-jobs",
    "delete-backup-jobs",
    // Security finding permissions
    "view-security-findings",
    "create-security-findings",
    "update-security-findings",
    "delete-security-findings",
    // Document permissions
    "view-documents",
    "create-documents",
    "update-documents",
    "delete-documents",
    // User management permissions
    "view-users",
    "create-users",
    "update-users",
    "delete-users",
    // Role management permissions
    "view-roles",
    "create-roles",
    "update-roles",
    "delete-roles",
    // Integration permissions
    "view-integrations",
    "create-integrations",
    "update-integrations",
    "delete-integrations",
    // Settings permissions
    "view-settings",
    "update-settings",
    // Activity log permissions
    "view-activity-logs",
    // Budget permissions
    "view-budget",
    "create-budget",
    "update-budget",
    "delete-budget",
    // Requisition permissions
    "view-requisitions",
    "create-requisitions",
    "update-requisitions",
    "delete-requisitions",
  ];

  const permissions = [];
  for (const name of permissionNames) {
    const perm = await prisma.permission.create({
      data: {
        name,
        guardName: "web",
      },
    });
    permissions.push(perm);
  }

  // ==================== Assign Permissions to Roles ====================
  console.log("Assigning permissions to roles...");

  // Super-admin gets all permissions
  for (const perm of permissions) {
    await prisma.roleHasPermission.create({
      data: {
        roleId: superAdminRole.id,
        permissionId: perm.id,
      },
    });
  }

  // DevOps Admin permissions
  const devopsAdminPermissions = permissionNames.filter(
    (p) =>
      !p.startsWith("create-users") &&
      !p.startsWith("update-users") &&
      !p.startsWith("delete-users") &&
      !p.startsWith("create-roles") &&
      !p.startsWith("update-roles") &&
      !p.startsWith("delete-roles") &&
      !p.startsWith("create-integrations") &&
      !p.startsWith("update-integrations") &&
      !p.startsWith("delete-integrations") &&
      !p.startsWith("view-settings") &&
      !p.startsWith("update-settings")
  );

  for (const permName of devopsAdminPermissions) {
    const perm = permissions.find((p) => p.name === permName);
    if (perm) {
      await prisma.roleHasPermission.create({
        data: {
          roleId: devopsAdminRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  // DevOps Engineer permissions
  const devopsEngineerPermissions = [
    "view-projects",
    "view-environments",
    "create-environments",
    "update-environments",
    "view-infrastructure",
    "create-infrastructure",
    "update-infrastructure",
    "view-services",
    "create-services",
    "update-services",
    "view-applications",
    "create-applications",
    "update-applications",
    "view-domains",
    "create-domains",
    "update-domains",
    "view-ssl-certificates",
    "create-ssl-certificates",
    "update-ssl-certificates",
    "view-deployments",
    "create-deployments",
    "update-deployments",
    "view-incidents",
    "create-incidents",
    "update-incidents",
    "view-changes",
    "create-changes",
    "update-changes",
    "view-backup-jobs",
    "create-backup-jobs",
    "update-backup-jobs",
    "view-security-findings",
    "create-security-findings",
    "update-security-findings",
    "view-documents",
    "create-documents",
    "update-documents",
    "view-activity-logs",
  ];

  for (const permName of devopsEngineerPermissions) {
    const perm = permissions.find((p) => p.name === permName);
    if (perm) {
      await prisma.roleHasPermission.create({
        data: {
          roleId: devopsEngineerRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  // Viewer permissions
  const viewerPermissions = [
    "view-projects",
    "view-environments",
    "view-infrastructure",
    "view-services",
    "view-applications",
    "view-domains",
    "view-ssl-certificates",
    "view-deployments",
    "view-incidents",
    "view-changes",
    "view-backup-jobs",
    "view-security-findings",
    "view-documents",
    "view-activity-logs",
  ];

  for (const permName of viewerPermissions) {
    const perm = permissions.find((p) => p.name === permName);
    if (perm) {
      await prisma.roleHasPermission.create({
        data: {
          roleId: viewerRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  // ==================== Create Users ====================
  console.log("Creating users...");

  const hashedPassword = await bcrypt.hash("password", 12);

  const admin = await prisma.user.create({
    data: {
      name: "Ahmad Faiz",
      email: "admin@devops-platform.local",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.modelHasRole.create({
    data: {
      roleId: superAdminRole.id,
      modelType: "App\\Models\\User",
      modelId: admin.id,
    },
  });

  const devopsAdmin = await prisma.user.create({
    data: {
      name: "Sarah Chen",
      email: "devops-admin@devops-platform.local",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.modelHasRole.create({
    data: {
      roleId: devopsAdminRole.id,
      modelType: "App\\Models\\User",
      modelId: devopsAdmin.id,
    },
  });

  const engineer = await prisma.user.create({
    data: {
      name: "Raj Kumar",
      email: "engineer@devops-platform.local",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.modelHasRole.create({
    data: {
      roleId: devopsEngineerRole.id,
      modelType: "App\\Models\\User",
      modelId: engineer.id,
    },
  });

  const viewer = await prisma.user.create({
    data: {
      name: "Lim Wei",
      email: "viewer@devops-platform.local",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.modelHasRole.create({
    data: {
      roleId: viewerRole.id,
      modelType: "App\\Models\\User",
      modelId: viewer.id,
    },
  });

  // ==================== Create Projects ====================
  console.log("Creating projects...");

  const project1 = await prisma.project.create({
    data: {
      name: "E-Commerce Platform",
      slug: "e-commerce-platform",
      description: "Main e-commerce web application and API services",
      status: "active",
      priority: "high",
      ownerId: admin.id,
      repositoryUrl: "https://github.com/company/ecommerce",
      documentationUrl: "https://docs.company.com/ecommerce",
      isActive: true,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: "Mobile Banking App",
      slug: "mobile-banking-app",
      description: "Mobile banking application for iOS and Android",
      status: "active",
      priority: "urgent",
      ownerId: devopsAdmin.id,
      repositoryUrl: "https://github.com/company/mobile-banking",
      isActive: true,
    },
  });

  const project3 = await prisma.project.create({
    data: {
      name: "Internal CRM",
      slug: "internal-crm",
      description: "Customer relationship management system",
      status: "planning",
      priority: "medium",
      ownerId: engineer.id,
      isActive: true,
    },
  });

  // ==================== Create Environments ====================
  console.log("Creating environments...");

  const devEnv = await prisma.environment.create({
    data: {
      projectId: project1.id,
      name: "Development",
      slug: "development",
      type: "development",
      description: "Development environment for active feature work",
      url: "https://dev.ecommerce.company.com",
      isActive: true,
    },
  });

  const stagingEnv = await prisma.environment.create({
    data: {
      projectId: project1.id,
      name: "Staging",
      slug: "staging",
      type: "staging",
      description: "Pre-production staging environment",
      url: "https://staging.ecommerce.company.com",
      isActive: true,
    },
  });

  const prodEnv = await prisma.environment.create({
    data: {
      projectId: project1.id,
      name: "Production",
      slug: "production",
      type: "production",
      description: "Live production environment",
      url: "https://www.ecommerce.company.com",
      isActive: true,
    },
  });

  await prisma.environment.create({
    data: {
      projectId: project2.id,
      name: "Development",
      slug: "development",
      type: "development",
      description: "Mobile app development environment",
      isActive: true,
    },
  });

  await prisma.environment.create({
    data: {
      projectId: project2.id,
      name: "Production",
      slug: "production",
      type: "production",
      description: "Live mobile app backend",
      isActive: true,
    },
  });

  // ==================== Create Team Assignments ====================
  console.log("Creating team assignments...");

  await prisma.teamAssignment.create({
    data: {
      projectId: project1.id,
      userId: admin.id,
      role: "lead",
    },
  });

  await prisma.teamAssignment.create({
    data: {
      projectId: project1.id,
      userId: engineer.id,
      role: "engineer",
    },
  });

  await prisma.teamAssignment.create({
    data: {
      projectId: project2.id,
      userId: devopsAdmin.id,
      role: "lead",
    },
  });

  await prisma.teamAssignment.create({
    data: {
      projectId: project2.id,
      userId: engineer.id,
      role: "engineer",
    },
  });

  // Assign projects to viewer
  await prisma.teamAssignment.create({
    data: {
      projectId: project1.id,
      userId: viewer.id,
      role: "viewer",
    },
  });

  // ==================== Create Infrastructure Nodes ====================
  console.log("Creating infrastructure nodes...");

  await prisma.infrastructureNode.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      name: "Web Server 1",
      hostname: "web01.prod.ecommerce",
      ipAddress: "10.0.1.10",
      type: "server",
      status: "healthy",
      operatingSystem: "Ubuntu 22.04 LTS",
      cpuCores: 8,
      memoryGb: 32,
      storageGb: 500,
      provider: "AWS",
      providerRegion: "ap-southeast-1",
      isActive: true,
    },
  });

  await prisma.infrastructureNode.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      name: "Database Server",
      hostname: "db01.prod.ecommerce",
      ipAddress: "10.0.1.20",
      type: "server",
      status: "healthy",
      operatingSystem: "Ubuntu 22.04 LTS",
      cpuCores: 16,
      memoryGb: 64,
      storageGb: 2000,
      provider: "AWS",
      providerRegion: "ap-southeast-1",
      isActive: true,
    },
  });

  await prisma.infrastructureNode.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      name: "Cache Server",
      hostname: "cache01.prod.ecommerce",
      ipAddress: "10.0.1.30",
      type: "server",
      status: "warning",
      operatingSystem: "Ubuntu 22.04 LTS",
      cpuCores: 4,
      memoryGb: 16,
      storageGb: 100,
      provider: "AWS",
      providerRegion: "ap-southeast-1",
      isActive: true,
      metadata: { warning: "Memory usage at 85%" },
    },
  });

  // ==================== Create Applications ====================
  console.log("Creating applications...");

  const app1 = await prisma.application.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      name: "E-Commerce Web",
      slug: "ecommerce-web",
      type: "web",
      status: "running",
      version: "2.4.1",
      repositoryUrl: "https://github.com/company/ecommerce-web",
      deploymentUrl: "https://www.ecommerce.company.com",
      healthCheckUrl: "https://www.ecommerce.company.com/health",
      description: "Main e-commerce web application",
      isActive: true,
    },
  });

  await prisma.application.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      name: "E-Commerce API",
      slug: "ecommerce-api",
      type: "api",
      status: "running",
      version: "2.4.1",
      repositoryUrl: "https://github.com/company/ecommerce-api",
      deploymentUrl: "https://api.ecommerce.company.com",
      healthCheckUrl: "https://api.ecommerce.company.com/health",
      description: "REST API backend",
      isActive: true,
    },
  });

  // ==================== Create Services ====================
  console.log("Creating services...");

  await prisma.service.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      name: "PostgreSQL",
      slug: "postgresql",
      type: "database",
      status: "running",
      version: "15.4",
      port: 5432,
      description: "Primary database",
      isActive: true,
    },
  });

  await prisma.service.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      name: "Redis",
      slug: "redis",
      type: "cache",
      status: "running",
      version: "7.2",
      port: 6379,
      description: "Cache and session store",
      isActive: true,
    },
  });

  // ==================== Create Deployments ====================
  console.log("Creating deployments...");

  const twoHoursAgo = new Date();
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

  const twoHoursAgoPlus5Min = new Date(twoHoursAgo);
  twoHoursAgoPlus5Min.setMinutes(twoHoursAgoPlus5Min.getMinutes() + 5);

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const threeDaysAgoPlus8Min = new Date(threeDaysAgo);
  threeDaysAgoPlus8Min.setMinutes(threeDaysAgoPlus8Min.getMinutes() + 8);

  await prisma.deployment.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      applicationId: app1.id,
      name: "v2.4.1 Release",
      status: "completed",
      version: "2.4.1",
      branch: "main",
      commitHash: "abc123def456",
      commitMessage: "Fix checkout flow bug",
      deployedBy: engineer.id,
      deployedAt: twoHoursAgo,
      completedAt: twoHoursAgoPlus5Min,
      durationSeconds: 300,
    },
  });

  await prisma.deployment.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      applicationId: app1.id,
      name: "v2.4.0 Release",
      status: "completed",
      version: "2.4.0",
      branch: "main",
      commitHash: "xyz789abc012",
      commitMessage: "Add new payment gateway",
      deployedBy: engineer.id,
      deployedAt: threeDaysAgo,
      completedAt: threeDaysAgoPlus8Min,
      durationSeconds: 480,
    },
  });

  // ==================== Create Incidents ====================
  console.log("Creating incidents...");

  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  await prisma.incident.create({
    data: {
      projectId: project1.id,
      environmentId: prodEnv.id,
      title: "High Memory Usage on Cache Server",
      slug: "high-memory-cache",
      description: "Cache server memory usage exceeded 85% threshold",
      status: "investigating",
      severity: "medium",
      priority: "high",
      assignedTo: engineer.id,
      reportedBy: admin.id,
      startedAt: oneHourAgo,
      isActive: true,
    },
  });

  // ==================== Create Domains ====================
  console.log("Creating domains...");

  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  await prisma.domain.create({
    data: {
      projectId: project1.id,
      name: "ecommerce.company.com",
      type: "primary",
      status: "active",
      registrar: "GoDaddy",
      expirationDate: oneYearFromNow,
      autoRenew: true,
      isActive: true,
    },
  });

  // ==================== Create Documents ====================
  console.log("Creating documents...");

  await prisma.document.create({
    data: {
      projectId: project1.id,
      title: "Architecture Overview",
      slug: "architecture-overview",
      content:
        "# Architecture Overview\n\nThis document describes the high-level architecture of the E-Commerce Platform.",
      type: "architecture",
      status: "published",
      authorId: admin.id,
      version: "1.0",
      isActive: true,
    },
  });

  await prisma.document.create({
    data: {
      projectId: project1.id,
      title: "Deployment Runbook",
      slug: "deployment-runbook",
      content:
        "# Deployment Runbook\n\n## Pre-deployment Checklist\n1. Run all tests\n2. Review changes\n3. Update changelog",
      type: "runbook",
      status: "published",
      authorId: engineer.id,
      version: "2.1",
      isActive: true,
    },
  });

  // ── Helpdesk Categories ────────────────────────────────────────────────
  const helpdeskCategories = [
    { name: "Hardware Issue", description: "Physical device problems", sortOrder: 1, color: "#ef4444" },
    { name: "Software Issue", description: "Application or OS problems", sortOrder: 2, color: "#f97316" },
    { name: "Network Issue", description: "Connectivity and network problems", sortOrder: 3, color: "#eab308" },
    { name: "Account & Access", description: "Login, password, permission issues", sortOrder: 4, color: "#22c55e" },
    { name: "Email Issue", description: "Email client or server problems", sortOrder: 5, color: "#3b82f6" },
    { name: "Server Issue", description: "Server downtime or performance", sortOrder: 6, color: "#8b5cf6" },
    { name: "Security Incident", description: "Security breaches or concerns", sortOrder: 7, color: "#ec4899" },
    { name: "Other", description: "General IT support requests", sortOrder: 8, color: "#6b7280" },
  ];

  for (const cat of helpdeskCategories) {
    await prisma.helpdeskCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: {
        name: cat.name,
        description: cat.description,
        sortOrder: cat.sortOrder,
        color: cat.color,
        isActive: true,
      },
    });
  }

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
