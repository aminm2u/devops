import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  Plus,
  FolderKanban,
  Calendar,
  User,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { projectsApi } from '@/api/projects';
import { useAuth } from '@/hooks/useAuth';
import { ProjectForm } from '@/components/projects/ProjectForm';
import {
  cn,
  formatDate,
  getStatusColor,
  getPriorityColor,
  formatStatus,
  truncate,
} from '@/lib/utils';
import type { ProjectFilters, Project } from '@/types';
import toast from 'react-hot-toast';

function ProjectCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-5 w-32 skeleton rounded" />
            <div className="h-4 w-48 skeleton rounded" />
          </div>
          <div className="h-6 w-16 skeleton rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-4 w-full skeleton rounded" />
          <div className="h-4 w-3/4 skeleton rounded" />
          <div className="flex items-center gap-4 pt-2">
            <div className="h-4 w-20 skeleton rounded" />
            <div className="h-4 w-24 skeleton rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const [filters, setFilters] = useState<ProjectFilters>({
    search: '',
    status: undefined,
    priority: undefined,
  });
  const [searchInput, setSearchInput] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects', filters],
    queryFn: () => projectsApi.getProjects(filters),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Project>) => projectsApi.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateDialog(false);
      toast.success('Project created successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create project');
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, search: searchInput });
  };

  const clearFilters = () => {
    setFilters({ search: '', status: undefined, priority: undefined });
    setSearchInput('');
  };

  const hasActiveFilters = filters.search || filters.status || filters.priority;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Manage and monitor your DevOps projects
          </p>
        </div>
        {(hasRole('super-admin') || hasRole('devops-admin')) && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <div className="flex gap-2">
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                status: value === 'all' ? undefined : (value as ProjectFilters['status']),
              })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.priority || 'all'}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                priority: value === 'all' ? undefined : (value as ProjectFilters['priority']),
              })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Projects Grid */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-12">
          <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Failed to load projects</h2>
          <p className="text-muted-foreground">Please try refreshing the page.</p>
        </div>
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : projects?.data?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">No projects found</h2>
          <p className="text-muted-foreground mb-4">
            {hasActiveFilters
              ? 'Try adjusting your filters'
              : 'Get started by creating your first project'}
          </p>
          {!hasActiveFilters && (hasRole('super-admin') || hasRole('devops-admin')) && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects?.data?.map((project) => (
            <Link key={project.id} to={`/projects/${project.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">
                        {project.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground truncate">
                        {truncate(project.description || 'No description', 60)}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge className={cn(getStatusColor(project.status))}>
                        {formatStatus(project.status)}
                      </Badge>
                      <Badge className={cn(getPriorityColor(project.priority))}>
                        {formatStatus(project.priority)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {project.owner && (
                        <div className="flex items-center gap-1.5">
                          <UserAvatar user={project.owner as any} size="sm" />
                          <span>{project.owner.name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(project.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{project._count?.environments ?? project.environments?.length ?? 0} environments</span>
                      <span>{project._count?.services ?? project.services?.length ?? 0} services</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <ProjectForm
            onSubmit={async (data) => {
              await createMutation.mutateAsync(data);
            }}
            onCancel={() => setShowCreateDialog(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
