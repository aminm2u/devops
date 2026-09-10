# DevOps Central Platform

A centralized internal DevOps operations platform built with Laravel.

## Technology Stack

- **Backend**: Laravel 11, PHP 8.2+
- **Database**: PostgreSQL
- **Cache/Queue**: Redis
- **Frontend**: Blade, Livewire, Alpine.js, Tailwind CSS
- **Containerization**: Docker, Docker Compose

## Development Environment Setup

### Prerequisites

- Docker Desktop
- Git

### Quick Start

1. Clone the repository
2. Start Docker services:
   ```bash
   docker compose up -d
   ```
3. Install dependencies:
   ```bash
   docker compose exec app composer install
   ```
4. Copy environment file:
   ```bash
   cp .env.example .env
   ```
5. Generate application key:
   ```bash
   docker compose exec app php artisan key:generate
   ```
6. Run migrations and seeders:
   ```bash
   docker compose exec app php artisan migrate --seed
   ```
7. Access the application:
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

## Testing

Run automated tests:
```bash
docker compose exec app php artisan test
```

## Phase 0 - Foundation and RBAC

### Implemented Features

- ✅ Laravel 11 project setup
- ✅ PostgreSQL database configuration
- ✅ Redis cache and queue configuration
- ✅ User authentication (login/logout)
- ✅ Role-based access control (Super Admin, DevOps Admin, DevOps Engineer, Viewer)
- ✅ Permission management with Spatie Permission
- ✅ Activity logging with Spatie Activity Log
- ✅ Project management (CRUD)
- ✅ Environment management (CRUD)
- ✅ Professional UI with Tailwind CSS
- ✅ Responsive navigation
- ✅ Dashboard with statistics
- ✅ Authorization policies
- ✅ Form validation
- ✅ Database migrations
- ✅ Automated tests

### Models Created

- User
- Project
- Environment
- TeamAssignment
- InfrastructureNode
- Service
- Application
- Domain
- SslCertificate
- Deployment
- Incident
- ChangeManagement
- BackupJob
- DisasterRecoveryPlan
- SecurityFinding
- Document

### Database Migrations

1. Users, password reset tokens, sessions
2. Cache and cache locks
3. Jobs, job batches, failed jobs
4. Permission tables (roles, permissions, model_has_permissions, model_has_roles, role_has_permissions)
5. Activity log
6. Projects
7. Environments
8. Team assignments
9. Infrastructure nodes
10. Services
11. Applications
12. Domains
13. SSL certificates
14. Deployments
15. Incidents
16. Change management
17. Backup jobs
18. Disaster recovery plans
19. Security findings
20. Documents

### Routes

- `GET /dashboard` - Dashboard
- `GET /projects` - List projects
- `GET /projects/create` - Create project form
- `POST /projects` - Store project
- `GET /projects/{project}` - Show project
- `GET /projects/{project}/edit` - Edit project form
- `PUT /projects/{project}` - Update project
- `DELETE /projects/{project}` - Delete project
- `GET /projects/{project}/environments` - List environments
- `GET /projects/{project}/environments/create` - Create environment form
- `POST /projects/{project}/environments` - Store environment
- `GET /projects/{project}/environments/{environment}` - Show environment
- `GET /projects/{project}/environments/{environment}/edit` - Edit environment form
- `PUT /projects/{project}/environments/{environment}` - Update environment
- `DELETE /projects/{project}/environments/{environment}` - Delete environment

### Security Considerations

- All passwords are hashed using bcrypt
- CSRF protection enabled on all forms
- Authorization enforced server-side using Laravel Gates and Policies
- Activity logging for all important actions
- Form validation on all inputs
- Parameterized database queries through Eloquent

### Next Steps (Phase 1)

- Complete project dashboard tabs
- Implement infrastructure inventory management
- Implement service management
- Implement application management
- Implement domain and SSL certificate management
- Implement deployment management
