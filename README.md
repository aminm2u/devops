# DevOps Central Platform

A centralized internal DevOps operations platform built with Node.js, Express, and React.

## Technology Stack

- **Backend**: Node.js, Express, TypeScript, Prisma ORM
- **Database**: PostgreSQL
- **Cache/Queue**: Redis
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Radix UI, Zustand, React Query
- **Real-Time**: Socket.IO
- **Containerization**: Docker, Docker Compose

## Development Environment Setup

### Prerequisites

- Docker Desktop
- Git
- Node.js (for local non-docker dev)

### Quick Start

1. Clone the repository
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Start Docker services:
   ```bash
   docker compose up -d
   ```
4. Access the application:
   - URL: http://localhost:8080
   - Admin Email: admin@devops-platform.local
   - Password: password

## Default User Roles

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@devops-platform.local | password |
| DevOps Admin | devops-admin@devops-platform.local | password |
| DevOps Engineer | engineer@devops-platform.local | password |
| Viewer | viewer@devops-platform.local | password |

## Architecture & Modules

### Implemented Features
- ✅ **RBAC & Auth:** User, Role, Permission, Notification, Session, ActivityLog.
- ✅ **Projects & Environments:** Project, Environment, TeamAssignment.
- ✅ **Infrastructure & Assets:** InfrastructureNode, Service, Application, Domain, SslCertificate, Credential.
- ✅ **Operations & Deployments:** Deployment, ChangeManagement, BackupJob, DisasterRecoveryPlan.
- ✅ **Incidents & Security:** Incident, SecurityFinding.
- ✅ **Documentation:** Internal document storage.
- ✅ **Helpdesk:** IT Ticketing System with Real-Time live comments (Socket.IO).
- ✅ **Budget Management:** BudgetItem, BudgetExpenditure tracking.
- ✅ **Requisitions:** Hardware & Software Requisition approval flows.

### Security Considerations

- All passwords are hashed using bcrypt
- JWT authentication for API
- Strict Zod validation on all API endpoints
- Authorization enforced via custom RBAC middleware
- Activity logging for all important actions
- Parameterized database queries through Prisma ORM

### Development

To run locally outside of docker:

**Backend:**
```bash
cd backend
npm install
npm run db:push
npm run db:seed
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```