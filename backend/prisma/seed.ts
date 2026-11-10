import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSION_CATALOG, ROLE_PRESETS, resolvePresetPermissions } from "../src/rbac/catalog.js";
import { MODEL_USER } from "../src/rbac/effective.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clean existing data (order matters for foreign keys)
  await prisma.approvalRequest.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.projectTask.deleteMany();
  await prisma.taskColumn.deleteMany();
  // Procurement tables (new)
  await prisma.paymentAttachment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.goodsReceiptItem.deleteMany();
  await prisma.goodsReceipt.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.directPurchase.deleteMany();
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.rfqItem.deleteMany();
  await prisma.requestForQuotation.deleteMany();
  await prisma.internalProject.deleteMany();
  await prisma.requisitionApproval.deleteMany();
  await prisma.approvalAssignment.deleteMany();
  await prisma.approvalPolicyTier.deleteMany();
  await prisma.approvalPolicy.deleteMany();
  await prisma.requisitionItem.deleteMany();
  await prisma.requisitionForm.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.referenceData.deleteMany();
  await prisma.referenceNumberConfig.deleteMany();
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
  // Units before departments: `units.department_id` cascades, but deleting the
  // parent explicitly keeps the reset order readable rather than relying on it.
  await prisma.unit.deleteMany();
  await prisma.department.deleteMany();
  await prisma.position.deleteMany();
  await prisma.employmentType.deleteMany();
  await prisma.projectType.deleteMany();
  await prisma.projectRole.deleteMany();

  // ==================== Reference Data ====================
  console.log("Creating reference data...");
  //
  // Departments start life as a mirror of the `division` master data: the two
  // must agree, otherwise the org chart lets you invent a department that the
  // procurement/budget division dropdown knows nothing about. Extra departments
  // can be added later under any of these roots.
  const deptIT = await prisma.department.create({ data: { code: 'IT', name: 'Information Technology' } });
  const deptHR = await prisma.department.create({ data: { code: 'HR', name: 'Human Resources' } });
  const deptFIN = await prisma.department.create({ data: { code: 'FIN', name: 'Finance' } });
  // Project Management Office sits under IT rather than beside it: the PMO
  // reports into the technology function here, and `parentId` is what makes the
  // org chart show that rather than two unrelated boxes.
  const deptPMO = await prisma.department.create({
    data: { code: 'PMO', name: 'Project Management Office', parentId: deptIT.id },
  });
  await prisma.department.createMany({
    data: [
      { code: 'DMA', name: 'Data Management & Analytics' },
      { code: 'BD', name: 'Business Development' },
      { code: 'IT', name: 'Information Technology' },
      { code: 'HR', name: 'Human Resources' },
      { code: 'FIN', name: 'Finance' },
      { code: 'ADMIN', name: 'Administration' },
      { code: 'PDS', name: 'Project Delivery Services' },
      { code: 'CS', name: 'CorporateServices' },
    ],
    skipDuplicates: true,
  });

  // Units sit inside a department, so they are created after the departments
  // they belong to. A person's `unit_id` is what the directory shows between
  // department and position; it is optional everywhere, and a department with
  // no units (Finance, below) is a normal state rather than an omission.
  const unitITDevOps = await prisma.unit.create({
    data: { name: 'DevOps', code: 'DEVOPS', departmentId: deptIT.id, sortOrder: 1 },
  });
  const unitITApps = await prisma.unit.create({
    data: { name: 'Application Development', code: 'DEV', departmentId: deptIT.id, sortOrder: 2 },
  });
  const unitITSAs = await prisma.unit.create({
    data: { name: 'System Analyst', code: 'SA', departmentId: deptIT.id, sortOrder: 3 },
  });
  const unitITUIUX = await prisma.unit.create({
    data: { name: 'UI/UX Designer', code: 'UIUX', departmentId: deptIT.id, sortOrder: 4 },
  });
  const unitITDigital = await prisma.unit.create({
    data: { name: 'Digital Innovation', code: 'DI', departmentId: deptIT.id, sortOrder: 5 },
  });
  const unitHRPeople = await prisma.unit.create({
    data: { name: 'People Operations', code: 'PEOPLE', departmentId: deptHR.id, sortOrder: 1 },
  });
  const unitHRPayroll = await prisma.unit.create({
    data: { name: 'Payroll & Benefits', code: 'PAYROLL', departmentId: deptHR.id, sortOrder: 2 },
  });
  const unitPMOPm = await prisma.unit.create({
    data: { name: 'Project Manager', code: 'PM', departmentId: deptPMO.id, sortOrder: 1 },
  });

  const posChief = await prisma.position.create({ data: { name: 'Chief', gradeLevel: 20 } });
  const posDeputyChief = await prisma.position.create({ data: { name: 'Deputy Chief', gradeLevel: 19 } });
  const posHod = await prisma.position.create({ data: { name: 'Head of Department', gradeLevel: 18 } });
  const posDeptHead = await prisma.position.create({ data: { name: 'General Manager', gradeLevel: 17 } });
  const posManager = await prisma.position.create({ data: { name: 'Manager', gradeLevel: 16 } });
  const posAsstManager = await prisma.position.create({ data: { name: 'Assistant Manager', gradeLevel: 15 } });
  const posTeamLead = await prisma.position.create({ data: { name: 'Team Lead', gradeLevel: 10 } });
  const posAsstTeamLead = await prisma.position.create({ data: { name: 'Assistant Team Lead', gradeLevel: 9 } });
  const posSrExec = await prisma.position.create({ data: { name: 'Senior Executive', gradeLevel: 5 } });
  const posJrExec = await prisma.position.create({ data: { name: 'Junior Executive', gradeLevel: 3 } });
  const posProtege = await prisma.position.create({ data: { name: 'Protege', gradeLevel: 2 } });
  const posIntern = await prisma.position.create({ data: { name: 'Intern', gradeLevel: 1 } });

  const empPerm = await prisma.employmentType.create({ data: { name: 'Permanent' } });
  const empContract = await prisma.employmentType.create({ data: { name: 'Contract' } });

  const ptInternal = await prisma.projectType.create({ data: { name: 'Internal Tool' } });
  const ptExternal = await prisma.projectType.create({ data: { name: 'Client Project' } });

  const prDirector = await prisma.projectRole.create({ data: { name: 'Project Director' } });
  const prManager = await prisma.projectRole.create({ data: { name: 'Project Manager' } });
  const prAssistantManager = await prisma.projectRole.create({ data: { name: 'Assistant Project Manager' } });
  const prConsultant = await prisma.projectRole.create({ data: { name: 'Project Consultant' } });
  const prSubjectMatterExpert = await prisma.projectRole.create({ data: { name: 'Subject Matter Expert' } });
  const prLead = await prisma.projectRole.create({ data: { name: 'Team Lead' } });
  const prDeveloper = await prisma.projectRole.create({ data: { name: 'Developer' } });

  // ==================== Roles & Permissions (from catalog) ====================
  //
  // The catalog in src/rbac/catalog.ts is the single source of truth. Every
  // permission row and every role preset is derived from it, so the seeder can
  // never drift from what the Access Control API and the UI matrix expose.
  console.log("Creating permissions and roles...");

  const permissionRows = await Promise.all(
    PERMISSION_CATALOG.map((perm) =>
      prisma.permission.create({
        data: {
          name: perm.name,
          guardName: "web",
          group: perm.group,
          description: perm.description,
          isDangerous: perm.isDangerous ?? false,
          supportsScope: perm.supportsScope ?? true,
        },
      })
    )
  );
  const permissionByName = new Map(permissionRows.map((p) => [p.name, p]));

  const roleByName = new Map<string, { id: number; name: string }>();

  for (const preset of ROLE_PRESETS) {
    const role = await prisma.role.create({
      data: {
        name: preset.name,
        guardName: "web",
        description: preset.description,
        isSystem: preset.isSystem ?? false,
        isAssignable: preset.isAssignable ?? true,
        level: preset.level,
        color: preset.color,
      },
    });
    roleByName.set(preset.name, role);

    const grants = resolvePresetPermissions(preset);
    const rows = grants
      .map((grant) => {
        const permission = permissionByName.get(grant.name);
        if (!permission) {
          console.warn(`  ! preset ${preset.name} references unknown permission ${grant.name}`);
          return null;
        }
        return {
          roleId: role.id,
          permissionId: permission.id,
          scope: grant.scope,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length) await prisma.roleHasPermission.createMany({ data: rows });
    console.log(
      `  ${preset.name.padEnd(30)} level ${String(preset.level).padEnd(4)} ${rows.length} permissions`
    );
  }

  const superAdminRole = roleByName.get("super-admin")!;

  // ==================== Users ====================
  console.log("Creating users...");

  const hashedPassword = await bcrypt.hash("password", 12);

  // The governing account. Exactly one super-admin may exist; the invariant is
  // asserted at the end of this seed and enforced by the transfer endpoint.
  const superAdminPassword = process.env.SEED_SUPERADMIN_PASSWORD || "ChangeMe!2026";
  const itAdmin = await prisma.user.create({
    data: {
      name: "IT Administrator",
      email: "it@map2u.com.my",
      password: await bcrypt.hash(superAdminPassword, 12),
      isActive: true,
      emailVerifiedAt: new Date(),
      employeeId: "EMP-001",
      departmentId: deptIT.id,
      unitId: null, // IT admin is not in a unit; they are above the units in the org chart
      positionId: null, // IT admin is not in a position; they are above the positions in the org chart
      employmentTypeId: empPerm.id,
      joinDate: new Date("2018-01-02"),
    },
  });

  await prisma.modelHasRole.create({
    data: {
      roleId: superAdminRole.id,
      modelType: MODEL_USER,
      modelId: itAdmin.id,
    },
  });
  await prisma.notificationPreference.create({
    data: { userId: itAdmin.id, email: true, inApp: true, sound: true },
  });

  const hrManager = await prisma.user.create({
    data: {
      name: "Suraya Hanim",
      email: "hr@map2u.com.my",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
      employeeId: "EMP-002",
      departmentId: deptHR.id,
      unitId: null,
      positionId: posManager.id,
      employmentTypeId: empPerm.id,
      joinDate: new Date("2019-04-08"),
    },
  });
  await prisma.modelHasRole.create({
    data: { roleId: roleByName.get("hr-manager")!.id, modelType: MODEL_USER, modelId: hrManager.id },
  });

  const devopsLead = await prisma.user.create({
    data: {
      name: "Che Mohd Amin Khalili",
      email: "amin@map2u.com.my",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
      employeeId: "EMP-003",
      departmentId: deptIT.id,
      unitId: unitITDevOps.id,
      positionId: posTeamLead.id,
      employmentTypeId: empPerm.id,
      joinDate: new Date("2021-03-10"),
      directManagerId: itAdmin.id,
    },
  });
  await prisma.modelHasRole.create({
    data: {
      roleId: roleByName.get("devops-team-lead")!.id,
      modelType: MODEL_USER,
      modelId: devopsLead.id,
    },
  });

  const engineer = await prisma.user.create({
    data: {
      name: "Fakhrul Irfan",
      email: "fakhrul.irfan@map2u.com.my",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
      employeeId: "EMP-004",
      departmentId: deptIT.id,
      unitId: unitITApps.id,
      positionId: posAsstTeamLead.id,
      employmentTypeId: empContract.id,
      joinDate: new Date("2022-06-01"),
      directManagerId: devopsLead.id,
    },
  });
  await prisma.modelHasRole.create({
    data: {
      roleId: roleByName.get("devops-engineer")!.id,
      modelType: MODEL_USER,
      modelId: engineer.id,
    },
  });

  const pmo = await prisma.user.create({
    data: {
      name: "Zakaria Mat Rani",
      email: "zakaria@map2u.com.my",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
      employeeId: "EMP-005",
      departmentId: deptPMO.id,
      unitId: unitPMOPm.id,
      positionId: posDeptHead.id,
      employmentTypeId: empPerm.id,
      joinDate: new Date("2020-07-13"),
      directManagerId: itAdmin.id,
    },
  });
  await prisma.modelHasRole.create({
    data: {
      roleId: roleByName.get("project-manager-officer")!.id,
      modelType: MODEL_USER,
      modelId: pmo.id,
    },
  });

  const finance = await prisma.user.create({
    data: {
      name: "Izzlee Lujaini",
      email: "izzlee@map2u.com.my",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
      employeeId: "EMP-006",
      departmentId: deptPMO.id,
      positionId: posSrExec.id,
      employmentTypeId: empPerm.id,
      joinDate: new Date("2020-02-17"),
      directManagerId: itAdmin.id,
    },
  });
  await prisma.modelHasRole.create({
    data: { roleId: roleByName.get("finance")!.id, modelType: MODEL_USER, modelId: finance.id },
  });

  const employee = await prisma.user.create({
    data: {
      name: "Aiman Mu'izz",
      email: "aiman@map2u.com.my",
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
      employeeId: "EMP-007",
      departmentId: deptIT.id,
      unitId: unitITDevOps.id,
      positionId: posSrExec.id,
      employmentTypeId: empContract.id,
      joinDate: new Date("2023-08-14"),
      directManagerId: hrManager.id,
    },
  });
  await prisma.modelHasRole.create({
    data: { roleId: roleByName.get("employee")!.id, modelType: MODEL_USER, modelId: employee.id },
  });

  await prisma.notificationPreference.createMany({
    data: [hrManager.id, devopsLead.id, engineer.id, pmo.id, finance.id, employee.id].map(
      (userId) => ({ userId, email: true, inApp: true, sound: true })
    ),
  });

  // ==================== Named test accounts ====================
  //
  // One account per tier, so the role-adaptive dashboard and the permission
  // matrix can be exercised by logging in rather than by editing the database.
  // They share the super-admin password so there is one credential to remember
  // while testing — these are demo accounts, not production identities.
  console.log("Creating named test accounts...");

  const testPassword = await bcrypt.hash("ChangeMe!2026", 12);

  /**
   * A test account. Roles are passed by preset name; the caller decides the
   * reporting line afterwards because the manager may be created later in the
   * same block.
   */
  const makeTestUser = async (input: {
    name: string;
    email: string;
    employeeId: string;
    departmentId: number;
    /** Optional: a person may sit directly in a department without a unit. */
    unitId?: number;
    positionId: number;
    employmentTypeId: number;
    joinDate: string;
  }) => {
    const user = await prisma.user.create({
      data: {
        ...input,
        // `joinDate` arrives as a bare "YYYY-MM-DD" string from the callers
        // below; Prisma wants a Date, and spreading the input would otherwise
        // hand the string straight to a DateTime column.
        joinDate: new Date(input.joinDate),
        password: testPassword,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.notificationPreference.create({
      data: { userId: user.id, email: true, inApp: true, sound: true },
    });
    return user;
  };

  const assignRole = (userId: number, roleName: string) =>
    prisma.modelHasRole.create({
      data: { roleId: roleByName.get(roleName)!.id, modelType: MODEL_USER, modelId: userId },
    });

  // IT manager — heads the IT department, so the IT head is their manager's
  // manager. Reports to the super admin to keep one root in the org chart.
  const azfar = await makeTestUser({
    name: "Azfar",
    email: "azfar@map2u.com.my",
    employeeId: "EMP-101",
    departmentId: deptIT.id,
    unitId: unitITApps.id,
    positionId: posDeptHead.id,
    employmentTypeId: empPerm.id,
    joinDate: "2019-02-04",
  });
  await assignRole(azfar.id, "department-head");

  // The four people below already exist from the block above — they were
  // created there because the demo projects, teams and incidents reference them
  // by id. Creating them a second time under the same email violates the unique
  // constraint on users.email, so this block only adds what the earlier records
  // do not already carry (extra roles, reporting lines, project membership).

  // PMO manager — heads the PMO department (nested under IT), so reports to
  // Azfar, which is also what makes IT a two-tier org chart to look at.
  const zakaria = pmo;
  await assignRole(zakaria.id, "department-head");
  await prisma.user.update({ where: { id: zakaria.id }, data: { directManagerId: azfar.id } });

  // DevOps team lead and his engineer, both inside IT. The lead reports to the
  // IT manager, the engineer to the lead — a chain the timesheet approver
  // resolver walks.
  const amin = devopsLead;
  await prisma.user.update({ where: { id: amin.id }, data: { directManagerId: azfar.id } });

  const aiman = engineer;

  // Project manager inside the PMO, reporting to the PMO manager.
  const wafiy = await makeTestUser({
    name: "Wafiy",
    email: "wafiy@map2u.com.my",
    employeeId: "EMP-105",
    departmentId: deptPMO.id,
    unitId: unitPMOPm.id,
    positionId: posManager.id,
    employmentTypeId: empPerm.id,
    joinDate: "2022-03-21",
  });
  await assignRole(wafiy.id, "project-manager-officer");
  await prisma.user.update({ where: { id: wafiy.id }, data: { directManagerId: zakaria.id } });

  // Departments are headed by the matching manager.
  await prisma.department.update({ where: { id: deptIT.id }, data: { managerId: azfar.id } });
  await prisma.department.update({ where: { id: deptHR.id }, data: { managerId: hrManager.id } });
  await prisma.department.update({ where: { id: deptFIN.id }, data: { managerId: finance.id } });
  await prisma.department.update({ where: { id: deptPMO.id }, data: { managerId: zakaria.id } });

  const opsTeam = await prisma.team.create({
    data: {
      name: "DevOps Operations",
      slug: "devops-operations",
      type: "devops",
      description: "Infrastructure, delivery and reliability",
      // The owning department is what makes `department`-scoped permissions
      // resolvable: scopeFilter widens team records through this link.
      departmentId: deptIT.id,
    },
  });
  const supportTeam = await prisma.team.create({
    data: {
      name: "Internal Support",
      slug: "internal-support",
      type: "support",
      description: "First-line helpdesk",
      departmentId: deptIT.id,
    },
  });
  // The PMO's own team. Without a team of their own a project manager holds
  // `timesheet.entry.read.team` but leads nothing, so their dashboard's team
  // tier resolves to null and the page silently drops the whole section.
  const pmoTeam = await prisma.team.create({
    data: {
      name: "Project Management",
      slug: "project-management",
      type: "project",
      description: "Delivery planning and project governance",
      departmentId: deptPMO.id,
    },
  });
  await prisma.teamMember.createMany({
    data: [
      // Che Mohd Amin Khalili leads the DevOps team and his engineer reports to
      // him. Both are the same records the project and incident data above
      // already point at, so each person appears here exactly once.
      { teamId: opsTeam.id, userId: amin.id, teamRole: "lead" },
      { teamId: opsTeam.id, userId: aiman.id, teamRole: "member" },
      { teamId: opsTeam.id, userId: itAdmin.id, teamRole: "member" },
      { teamId: supportTeam.id, userId: employee.id, teamRole: "lead" },
      { teamId: pmoTeam.id, userId: wafiy.id, teamRole: "lead" },
      { teamId: pmoTeam.id, userId: zakaria.id, teamRole: "member" },
    ],
  });

  // Retained names for the demo data below.
  const admin = itAdmin;
  const devopsAdmin = devopsLead;
  const viewer = employee;


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
      projectTypeId: ptExternal.id,
      startDate: new Date("2023-01-01"),
      expectedEndDate: new Date("2024-12-31"),
      healthStatus: "On Track",
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
      projectTypeId: ptExternal.id,
      startDate: new Date("2023-06-01"),
      expectedEndDate: new Date("2024-05-30"),
      healthStatus: "Delayed",
      delayReason: "Waiting on external API vendor",
      recommendation: "Assign more developers to the vendor integration team.",
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
      projectTypeId: ptInternal.id,
      startDate: new Date("2024-01-01"),
      expectedEndDate: new Date("2025-01-01"),
      healthStatus: "Planning",
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
      projectRoleId: prManager.id,
    },
  });

  await prisma.teamAssignment.create({
    data: {
      projectId: project1.id,
      userId: engineer.id,
      projectRoleId: prDeveloper.id,
    },
  });

  await prisma.teamAssignment.create({
    data: {
      projectId: project2.id,
      userId: devopsAdmin.id,
      projectRoleId: prLead.id,
    },
  });

  await prisma.teamAssignment.create({
    data: {
      projectId: project2.id,
      userId: engineer.id,
      projectRoleId: prDeveloper.id,
    },
  });

  // Assign projects to viewer
  await prisma.teamAssignment.create({
    data: {
      projectId: project1.id,
      userId: viewer.id,
      projectRoleId: prDeveloper.id,
    },
  });

  // Give the named test accounts a project to land on. A project manager with
  // no project opens an empty list, and a DevOps engineer with no team
  // membership cannot be assigned a task — both make the pages untestable.
  // `team_assignments` is unique on (project, user), and Amin and Aiman were
  // already placed above, so they are not repeated here.
  await prisma.teamAssignment.createMany({
    data: [
      { projectId: project1.id, userId: wafiy.id, projectRoleId: prManager.id },
      { projectId: project2.id, userId: wafiy.id, projectRoleId: prManager.id },
      { projectId: project3.id, userId: wafiy.id, projectRoleId: prManager.id },
      { projectId: project3.id, userId: amin.id, projectRoleId: prLead.id },
      { projectId: project1.id, userId: azfar.id, projectRoleId: prLead.id },
      { projectId: project2.id, userId: zakaria.id, projectRoleId: prLead.id },
    ],
  });

  // ==================== Kanban Setup ====================
  console.log("Creating Kanban boards...");

  const colTodo = await prisma.taskColumn.create({ data: { projectId: project1.id, name: "To Do", position: 1 } });
  const colInProgress = await prisma.taskColumn.create({ data: { projectId: project1.id, name: "In Progress", position: 2 } });
  const colReview = await prisma.taskColumn.create({ data: { projectId: project1.id, name: "Review", position: 3 } });
  const colDone = await prisma.taskColumn.create({ data: { projectId: project1.id, name: "Done", position: 4 } });

  await prisma.projectTask.create({
    data: {
      projectId: project1.id,
      columnId: colTodo.id,
      title: "Setup CI/CD Pipeline",
      description: "Configure GitHub Actions for deployment",
      assignees: [devopsAdmin.id],
      priority: "high",
      dueDate: new Date("2024-10-01"),
    }
  });

  await prisma.projectTask.create({
    data: {
      projectId: project1.id,
      columnId: colInProgress.id,
      title: "Design Database Schema",
      description: "ERD design for the new microservice",
      assignees: [engineer.id],
      priority: "medium",
      dueDate: new Date("2024-09-15"),
    }
  });

  // Work already sitting with the test accounts, so the kanban, the calendar
  // and the dashboard's task panel are not empty on first login.
  await prisma.projectTask.createMany({
    data: [
      {
        projectId: project1.id,
        columnId: colTodo.id,
        title: "Containerise the reporting worker",
        description: "Move the nightly report job into the shared cluster",
        assignees: [aiman.id],
        priority: "high",
      },
      {
        projectId: project1.id,
        columnId: colInProgress.id,
        title: "Rotate the staging TLS certificates",
        assignees: [aiman.id, amin.id],
        priority: "medium",
      },
      {
        projectId: project1.id,
        columnId: colReview.id,
        title: "Sign off the Q4 delivery plan",
        description: "Confirm scope and resourcing with the PMO",
        assignees: [wafiy.id],
        priority: "high",
      },
    ],
  });

  // ==================== Create Infrastructure Nodes ====================
  console.log("Creating infrastructure nodes...");

  await prisma.infrastructureNode.create({
    data: {
      projectId: project1.id,
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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
      teamId: opsTeam.id,
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

  // ── Reference Data (Dropdowns) ─────────────────────────────────────────
  console.log("Seeding reference data...");

  const referenceDataGroups: Record<string, { value: string; label: string; sortOrder: number }[]> = {
    budget_type: [
      { value: "project", label: "Project", sortOrder: 1 },
      { value: "department", label: "Department", sortOrder: 2 },
      { value: "event", label: "Event", sortOrder: 3 },
      { value: "programme", label: "Programme", sortOrder: 4 },
      { value: "overhead", label: "Overhead", sortOrder: 5 },
      { value: "capital", label: "Capital", sortOrder: 6 },
    ],
    division: [
      { value: "IT", label: "Information Technology", sortOrder: 1 },
      { value: "DMA", label: "Digital Marketing & Analytics", sortOrder: 2 },
      { value: "HR", label: "Human Resources", sortOrder: 3 },
      { value: "BD", label: "Business Development", sortOrder: 4 },
      { value: "DI", label: "Digital Innovation", sortOrder: 5 },
      { value: "ADMIN", label: "Administration", sortOrder: 6 },
      { value: "FIN", label: "Finance", sortOrder: 7 },
      { value: "OPS", label: "Operations", sortOrder: 8 },
      { value: "PMO", label: "Project Management Office", sortOrder: 9 },
    ],
    uom: [
      { value: "Unit", label: "Unit", sortOrder: 1 },
      { value: "Set", label: "Set", sortOrder: 2 },
      { value: "Box", label: "Box", sortOrder: 3 },
      { value: "Piece", label: "Piece", sortOrder: 4 },
      { value: "Lot", label: "Lot", sortOrder: 5 },
      { value: "Month", label: "Month", sortOrder: 6 },
      { value: "Year", label: "Year", sortOrder: 7 },
      { value: "License", label: "License", sortOrder: 8 },
      { value: "Kg", label: "Kilogram", sortOrder: 9 },
      { value: "Meter", label: "Meter", sortOrder: 10 },
      { value: "Pack", label: "Pack", sortOrder: 11 },
    ],
    budget_category: [
      { value: "Hardware", label: "Hardware", sortOrder: 1 },
      { value: "Software", label: "Software", sortOrder: 2 },
      { value: "Maintenance", label: "Maintenance", sortOrder: 3 },
      { value: "Office Equipment", label: "Office Equipment", sortOrder: 4 },
      { value: "Rentals", label: "Rentals", sortOrder: 5 },
      { value: "Hosting", label: "Hosting", sortOrder: 6 },
      { value: "Security", label: "Security", sortOrder: 7 },
      { value: "Training", label: "Training", sortOrder: 8 },
      { value: "Consulting", label: "Consulting", sortOrder: 9 },
      { value: "Other", label: "Other", sortOrder: 10 },
    ],
    currency: [
      { value: "MYR", label: "Malaysian Ringgit (MYR)", sortOrder: 1 },
      { value: "USD", label: "US Dollar (USD)", sortOrder: 2 },
      { value: "EUR", label: "Euro (EUR)", sortOrder: 3 },
      { value: "GBP", label: "British Pound (GBP)", sortOrder: 4 },
      { value: "SGD", label: "Singapore Dollar (SGD)", sortOrder: 5 },
      { value: "JPY", label: "Japanese Yen (JPY)", sortOrder: 6 },
    ],
    procurement_type: [
      { value: "material", label: "Material", sortOrder: 1 },
      { value: "service", label: "Service", sortOrder: 2 },
    ],
    urgency_level: [
      { value: "low", label: "Low", sortOrder: 1 },
      { value: "normal", label: "Normal", sortOrder: 2 },
      { value: "high", label: "High", sortOrder: 3 },
      { value: "urgent", label: "Urgent", sortOrder: 4 },
    ],
    status_budget: [
      { value: "request", label: "Request", sortOrder: 1 },
      { value: "approved", label: "Approved", sortOrder: 2 },
      { value: "active", label: "Active", sortOrder: 3 },
      { value: "closed", label: "Closed", sortOrder: 4 },
    ],
    status_requisition: [
      { value: "draft", label: "Draft", sortOrder: 1 },
      { value: "submitted", label: "Submitted", sortOrder: 2 },
      { value: "under_review", label: "Under Review", sortOrder: 3 },
      { value: "approved", label: "Approved", sortOrder: 4 },
      { value: "rejected", label: "Rejected", sortOrder: 5 },
      { value: "in_procurement", label: "In Procurement", sortOrder: 6 },
      { value: "completed", label: "Completed", sortOrder: 7 },
    ],
    status_po: [
      { value: "draft", label: "Draft", sortOrder: 1 },
      { value: "submitted", label: "Submitted", sortOrder: 2 },
      { value: "approved", label: "Approved", sortOrder: 3 },
      { value: "dispatched", label: "Dispatched", sortOrder: 4 },
      { value: "partially_received", label: "Partially Received", sortOrder: 5 },
      { value: "fully_received", label: "Fully Received", sortOrder: 6 },
      { value: "completed", label: "Completed", sortOrder: 7 },
      { value: "cancelled", label: "Cancelled", sortOrder: 8 },
    ],
    status_rfq: [
      { value: "draft", label: "Draft", sortOrder: 1 },
      { value: "sent", label: "Sent", sortOrder: 2 },
      { value: "receiving", label: "Receiving", sortOrder: 3 },
      { value: "evaluating", label: "Evaluating", sortOrder: 4 },
      { value: "awarded", label: "Awarded", sortOrder: 5 },
      { value: "cancelled", label: "Cancelled", sortOrder: 6 },
    ],
    status_payment: [
      { value: "draft", label: "Draft", sortOrder: 1 },
      { value: "submitted", label: "Submitted", sortOrder: 2 },
      { value: "approved", label: "Approved", sortOrder: 3 },
      { value: "paid", label: "Paid", sortOrder: 4 },
      { value: "cancelled", label: "Cancelled", sortOrder: 5 },
    ],
    status_grn: [
      { value: "pending", label: "Pending", sortOrder: 1 },
      { value: "inspected", label: "Inspected", sortOrder: 2 },
      { value: "accepted", label: "Accepted", sortOrder: 3 },
      { value: "rejected", label: "Rejected", sortOrder: 4 },
      { value: "partial", label: "Partial", sortOrder: 5 },
    ],
    asset_category: [
      { value: "furniture", label: "Furniture", sortOrder: 1 },
      { value: "it_equipment", label: "IT Equipment", sortOrder: 2 },
      { value: "vehicle", label: "Vehicle", sortOrder: 3 },
      { value: "machinery", label: "Machinery", sortOrder: 4 },
      { value: "other", label: "Other", sortOrder: 5 },
    ],
    payment_method: [
      { value: "bank_transfer", label: "Bank Transfer", sortOrder: 1 },
      { value: "cheque", label: "Cheque", sortOrder: 2 },
      { value: "cash", label: "Cash", sortOrder: 3 },
      { value: "online", label: "Online Payment", sortOrder: 4 },
    ],
    timesheet_category: [
      { value: "project", label: "Project", sortOrder: 1 },
      { value: "management", label: "Management", sortOrder: 2 },
      { value: "programme", label: "Programme", sortOrder: 3 },
      { value: "meeting", label: "Meeting", sortOrder: 4 },
      { value: "others", label: "Others", sortOrder: 5 },
    ],

    // ── DevOps ────────────────────────────────────────────────────────────
    // These mirror the zod enums in the corresponding routes. Keeping them
    // here means the filters and create forms read a list an admin can edit,
    // instead of a copy of a literal that quietly drifts from the API.
    status_deployment: [
      { value: "pending", label: "Pending", sortOrder: 1 },
      { value: "in_progress", label: "In Progress", sortOrder: 2 },
      { value: "completed", label: "Completed", sortOrder: 3 },
      { value: "failed", label: "Failed", sortOrder: 4 },
      { value: "rolled_back", label: "Rolled Back", sortOrder: 5 },
    ],
    incident_severity: [
      { value: "low", label: "Low", sortOrder: 1 },
      { value: "medium", label: "Medium", sortOrder: 2 },
      { value: "high", label: "High", sortOrder: 3 },
      { value: "critical", label: "Critical", sortOrder: 4 },
    ],
    status_incident: [
      { value: "open", label: "Open", sortOrder: 1 },
      { value: "investigating", label: "Investigating", sortOrder: 2 },
      { value: "identified", label: "Identified", sortOrder: 3 },
      { value: "monitoring", label: "Monitoring", sortOrder: 4 },
      { value: "resolved", label: "Resolved", sortOrder: 5 },
      { value: "closed", label: "Closed", sortOrder: 6 },
    ],
    infrastructure_node_type: [
      { value: "server", label: "Server", sortOrder: 1 },
      { value: "database", label: "Database", sortOrder: 2 },
      { value: "load-balancer", label: "Load Balancer", sortOrder: 3 },
      { value: "cache", label: "Cache", sortOrder: 4 },
      { value: "queue", label: "Queue", sortOrder: 5 },
      { value: "storage", label: "Storage", sortOrder: 6 },
      { value: "network", label: "Network", sortOrder: 7 },
      { value: "container", label: "Container", sortOrder: 8 },
      { value: "kubernetes", label: "Kubernetes", sortOrder: 9 },
    ],
    infrastructure_status: [
      { value: "active", label: "Active", sortOrder: 1 },
      { value: "healthy", label: "Healthy", sortOrder: 2 },
      { value: "warning", label: "Warning", sortOrder: 3 },
      { value: "critical", label: "Critical", sortOrder: 4 },
      { value: "offline", label: "Offline", sortOrder: 5 },
      { value: "maintenance", label: "Maintenance", sortOrder: 6 },
    ],
    domain_type: [
      { value: "primary", label: "Primary", sortOrder: 1 },
      { value: "redirect", label: "Redirect", sortOrder: 2 },
      { value: "alias", label: "Alias", sortOrder: 3 },
      { value: "subdomain", label: "Subdomain", sortOrder: 4 },
    ],
    status_domain: [
      { value: "active", label: "Active", sortOrder: 1 },
      { value: "pending", label: "Pending", sortOrder: 2 },
      { value: "expired", label: "Expired", sortOrder: 3 },
      { value: "suspended", label: "Suspended", sortOrder: 4 },
    ],
    ssl_certificate_type: [
      { value: "letsencrypt", label: "Let's Encrypt", sortOrder: 1 },
      { value: "self-signed", label: "Self-signed", sortOrder: 2 },
      { value: "commercial", label: "Commercial", sortOrder: 3 },
      { value: "internal", label: "Internal", sortOrder: 4 },
    ],
    status_ssl_certificate: [
      { value: "pending", label: "Pending", sortOrder: 1 },
      { value: "valid", label: "Valid", sortOrder: 2 },
      // Written by POST /ssl/:id/renew while the ACME job runs.
      { value: "renewing", label: "Renewing", sortOrder: 3 },
      { value: "expired", label: "Expired", sortOrder: 4 },
      { value: "revoked", label: "Revoked", sortOrder: 5 },
    ],
    environment_type: [
      { value: "development", label: "Development", sortOrder: 1 },
      { value: "testing", label: "Testing", sortOrder: 2 },
      { value: "staging", label: "Staging", sortOrder: 3 },
      { value: "production", label: "Production", sortOrder: 4 },
    ],
    service_type: [
      { value: "web", label: "Web", sortOrder: 1 },
      { value: "api", label: "API", sortOrder: 2 },
      { value: "database", label: "Database", sortOrder: 3 },
      { value: "cache", label: "Cache", sortOrder: 4 },
      { value: "queue", label: "Queue", sortOrder: 5 },
      { value: "worker", label: "Worker", sortOrder: 6 },
      { value: "cron", label: "Cron", sortOrder: 7 },
      { value: "other", label: "Other", sortOrder: 8 },
    ],
    status_service: [
      { value: "running", label: "Running", sortOrder: 1 },
      { value: "active", label: "Active", sortOrder: 2 },
      { value: "inactive", label: "Inactive", sortOrder: 3 },
      { value: "maintenance", label: "Maintenance", sortOrder: 4 },
      { value: "error", label: "Error", sortOrder: 5 },
      { value: "unknown", label: "Unknown", sortOrder: 6 },
    ],
    document_type: [
      { value: "documentation", label: "Documentation", sortOrder: 1 },
      { value: "runbook", label: "Runbook", sortOrder: 2 },
      { value: "architecture", label: "Architecture", sortOrder: 3 },
      { value: "api", label: "API Spec", sortOrder: 4 },
      { value: "meeting_notes", label: "Meeting Notes", sortOrder: 5 },
      { value: "other", label: "Other", sortOrder: 6 },
    ],
    status_document: [
      { value: "draft", label: "Draft", sortOrder: 1 },
      { value: "review", label: "Review", sortOrder: 2 },
      { value: "published", label: "Published", sortOrder: 3 },
      { value: "archived", label: "Archived", sortOrder: 4 },
    ],
    credential_type: [
      { value: "server", label: "Server", sortOrder: 1 },
      { value: "database", label: "Database", sortOrder: 2 },
      { value: "ssh", label: "SSH", sortOrder: 3 },
      { value: "api", label: "API", sortOrder: 4 },
      { value: "other", label: "Other", sortOrder: 5 },
    ],
    cloud_provider: [
      { value: "aws", label: "AWS", sortOrder: 1 },
      { value: "gcp", label: "Google Cloud", sortOrder: 2 },
      { value: "azure", label: "Azure", sortOrder: 3 },
      { value: "digitalocean", label: "DigitalOcean", sortOrder: 4 },
      { value: "linode", label: "Linode", sortOrder: 5 },
      { value: "vultr", label: "Vultr", sortOrder: 6 },
      { value: "on-premise", label: "On-Premise", sortOrder: 7 },
      { value: "other", label: "Other", sortOrder: 8 },
    ],
    team_type: [
      { value: "devops", label: "DevOps", sortOrder: 1 },
      { value: "support", label: "Support", sortOrder: 2 },
      { value: "project", label: "Project", sortOrder: 3 },
      { value: "ops", label: "Operations", sortOrder: 4 },
    ],

    // ── Helpdesk ──────────────────────────────────────────────────────────
    status_ticket: [
      { value: "open", label: "Open", sortOrder: 1 },
      { value: "in_progress", label: "In Progress", sortOrder: 2 },
      { value: "awaiting_response", label: "Awaiting Response", sortOrder: 3 },
      { value: "resolved", label: "Resolved", sortOrder: 4 },
      { value: "closed", label: "Closed", sortOrder: 5 },
      { value: "reopened", label: "Reopened", sortOrder: 6 },
    ],
    ticket_priority: [
      { value: "low", label: "Low", sortOrder: 1 },
      { value: "medium", label: "Medium", sortOrder: 2 },
      { value: "high", label: "High", sortOrder: 3 },
      { value: "urgent", label: "Urgent", sortOrder: 4 },
    ],
    ticket_source: [
      { value: "web", label: "Web", sortOrder: 1 },
      { value: "email", label: "Email", sortOrder: 2 },
      { value: "phone", label: "Phone", sortOrder: 3 },
      { value: "chat", label: "Chat", sortOrder: 4 },
      { value: "walk-in", label: "Walk-in", sortOrder: 5 },
    ],

    // ── Projects, assets, timesheet ───────────────────────────────────────
    status_project: [
      { value: "planning", label: "Planning", sortOrder: 1 },
      { value: "active", label: "Active", sortOrder: 2 },
      { value: "inactive", label: "Inactive", sortOrder: 3 },
      { value: "archived", label: "Archived", sortOrder: 4 },
    ],
    project_priority: [
      { value: "low", label: "Low", sortOrder: 1 },
      { value: "medium", label: "Medium", sortOrder: 2 },
      { value: "high", label: "High", sortOrder: 3 },
      { value: "urgent", label: "Urgent", sortOrder: 4 },
      { value: "critical", label: "Critical", sortOrder: 5 },
    ],
    status_subtask: [
      { value: "open", label: "Open", sortOrder: 1 },
      { value: "in_progress", label: "In Progress", sortOrder: 2 },
      { value: "done", label: "Done", sortOrder: 3 },
    ],
    status_asset: [
      { value: "active", label: "Active", sortOrder: 1 },
      { value: "inactive", label: "Inactive", sortOrder: 2 },
      { value: "maintenance", label: "Under Maintenance", sortOrder: 3 },
      { value: "disposed", label: "Disposed", sortOrder: 4 },
      { value: "decommissioned", label: "Decommissioned", sortOrder: 5 },
    ],
    status_timesheet_entry: [
      { value: "draft", label: "Draft", sortOrder: 1 },
      { value: "submitted", label: "Submitted", sortOrder: 2 },
      { value: "approved", label: "Approved", sortOrder: 3 },
      { value: "rejected", label: "Rejected", sortOrder: 4 },
    ],
    status_direct_purchase: [
      { value: "draft", label: "Draft", sortOrder: 1 },
      { value: "submitted", label: "Submitted", sortOrder: 2 },
      { value: "approved", label: "Approved", sortOrder: 3 },
      { value: "completed", label: "Completed", sortOrder: 4 },
      { value: "rejected", label: "Rejected", sortOrder: 5 },
    ],
    status_internal_project: [
      { value: "planning", label: "Planning", sortOrder: 1 },
      { value: "in_progress", label: "In Progress", sortOrder: 2 },
      { value: "on_hold", label: "On Hold", sortOrder: 3 },
      { value: "completed", label: "Completed", sortOrder: 4 },
      { value: "cancelled", label: "Cancelled", sortOrder: 5 },
    ],
  };

  for (const [group, items] of Object.entries(referenceDataGroups)) {
    for (const item of items) {
      await prisma.referenceData.upsert({
        where: { group_value: { group, value: item.value } },
        update: { label: item.label, sortOrder: item.sortOrder },
        create: { group, value: item.value, label: item.label, sortOrder: item.sortOrder },
      });
    }
  }

  // ── Reference Number Configurations ────────────────────────────────────
  console.log("Seeding reference number configurations...");

  const numberConfigs = [
    // Employment is not dated: a staff number is for life, and the seeded
    // directory already uses this shape (EMP-001 … EMP-007). The counter starts
    // past those seven because the next hire is issued by the generator, and a
    // counter sitting at 1 would spend its first attempts colliding with the
    // numbers this seed just wrote.
    {
      refType: "employee",
      prefix: "EMP",
      separator: "-",
      yearFormat: "NONE",
      digitPadding: 3,
      startFrom: 8,
    },
    { refType: "req", prefix: "REQ", separator: "-", yearFormat: "YYYY", digitPadding: 4 },
    { refType: "rfq", prefix: "RFQ", separator: "-", yearFormat: "YYYY", digitPadding: 4 },
    { refType: "po", prefix: "PO", separator: "-", yearFormat: "YYYY", digitPadding: 5 },
    { refType: "lo", prefix: "LO", separator: "-", yearFormat: "YYYY", digitPadding: 5 },
    { refType: "dp", prefix: "DP", separator: "-", yearFormat: "YYYY", digitPadding: 4 },
    { refType: "grn", prefix: "GRN", separator: "-", yearFormat: "YYYY", digitPadding: 5 },
    { refType: "pay", prefix: "PAY", separator: "-", yearFormat: "YYYY", digitPadding: 5 },
    { refType: "asset", prefix: "ASSET", separator: "-", yearFormat: "YYYY", digitPadding: 5 },
  ];

  for (const config of numberConfigs) {
    const { startFrom, ...rest } = config as typeof config & { startFrom?: number };
    await prisma.referenceNumberConfig.upsert({
      where: { refType: rest.refType },
      update: {},
      create: {
        refType: rest.refType,
        prefix: rest.prefix,
        separator: rest.separator,
        yearFormat: rest.yearFormat,
        digitPadding: rest.digitPadding,
        currentCounter: startFrom ?? 1,
      },
    });
  }

  // ── Default Approval Policy ────────────────────────────────────────────
  console.log("Seeding default approval policy...");

  const defaultPolicy = await prisma.approvalPolicy.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Default Procurement Approval",
      description: "Standard approval policy for all procurement types",
      isActive: true,
    },
  });

  // Create tiers
  const existingTiers = await prisma.approvalPolicyTier.count({
    where: { policyId: defaultPolicy.id },
  });

  if (existingTiers === 0) {
    await prisma.approvalPolicyTier.createMany({
      data: [
        { policyId: defaultPolicy.id, minAmount: 0, maxAmount: 10000, requiredApprovals: 1 },
        { policyId: defaultPolicy.id, minAmount: 10001, maxAmount: 50000, requiredApprovals: 2 },
        { policyId: defaultPolicy.id, minAmount: 50001, maxAmount: 200000, requiredApprovals: 3 },
        { policyId: defaultPolicy.id, minAmount: 200001, maxAmount: 999999999, requiredApprovals: 3 },
      ],
    });

    // Assign admin and devops-admin as approvers
    await prisma.approvalAssignment.createMany({
      data: [
        { policyId: defaultPolicy.id, userId: admin.id, sortOrder: 1 },
        { policyId: defaultPolicy.id, userId: devopsAdmin.id, sortOrder: 2 },
      ],
    });
  }

  // ==================== Invariants ====================
  // Exactly one super-admin may exist. If this ever fails, the platform has no
  // unambiguous owner and privilege transfer would be unsafe.
  const superAdminHolders = await prisma.modelHasRole.count({
    where: {
      modelType: MODEL_USER,
      roleId: superAdminRole.id,
    },
  });
  if (superAdminHolders !== 1) {
    throw new Error(
      `Invariant violated: expected exactly 1 super-admin, found ${superAdminHolders}`
    );
  }

  const target = await prisma.modelHasRole.findFirst({
    where: { modelType: MODEL_USER, roleId: superAdminRole.id },
  });
  const holder = await prisma.user.findUnique({
    where: { id: target!.modelId },
    select: { email: true },
  });
  if (holder?.email !== "it@map2u.com.my") {
    throw new Error(`Invariant violated: super-admin is ${holder?.email}, expected it@map2u.com.my`);
  }

  console.log(`Super admin: ${holder.email} (sole holder)`);
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
