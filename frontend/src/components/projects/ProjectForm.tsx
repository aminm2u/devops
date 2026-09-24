import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import type { Project } from '@/types';

interface ProjectFormProps {
  project?: Project;
  onSubmit: (data: Partial<Project>) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface UserOption {
  id: number;
  name: string;
  email: string;
}

export function ProjectForm({ project, onSubmit, onCancel, isLoading }: ProjectFormProps) {
  const { user } = useAuth();
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [status, setStatus] = useState(project?.status || 'planning');
  const [priority, setPriority] = useState(project?.priority || 'medium');
  const [repositoryUrl, setRepositoryUrl] = useState(project?.repositoryUrl || '');
  const [documentationUrl, setDocumentationUrl] = useState(project?.documentationUrl || '');
  const [ownerId, setOwnerId] = useState<string>(project?.ownerId?.toString() || user?.id?.toString() || '');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiClient.get('/admin/users/list');
        setUsers(response.data.data || []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        // Fallback: use current user
        if (user) {
          setUsers([{ id: user.id, name: user.name, email: user.email }]);
        }
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [user]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';
    if (repositoryUrl && !/^https?:\/\/.+/.test(repositoryUrl)) {
      newErrors.repositoryUrl = 'Must be a valid URL';
    }
    if (documentationUrl && !/^https?:\/\/.+/.test(documentationUrl)) {
      newErrors.documentationUrl = 'Must be a valid URL';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      status: status as any,
      priority: priority as any,
      repositoryUrl: repositoryUrl.trim() || null,
      documentationUrl: documentationUrl.trim() || null,
      ownerId: ownerId ? parseInt(ownerId, 10) : undefined,
    });
  };

  return (
    <Card className='pt-8'>
      <CardHeader>
        <CardTitle>{project ? 'Edit Project' : 'Create New Project'}</CardTitle>
        <CardDescription>
          {project ? 'Update project details' : 'Fill in the details to create a new project'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
              placeholder="e.g., E-Commerce Platform"
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the project"
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="repo">Repository URL</Label>
            <Input
              id="repo"
              value={repositoryUrl}
              onChange={(e) => {
                setRepositoryUrl(e.target.value);
                if (errors.repositoryUrl) setErrors({ ...errors, repositoryUrl: '' });
              }}
              placeholder="https://github.com/org/repo"
              className={errors.repositoryUrl ? 'border-destructive' : ''}
            />
            {errors.repositoryUrl && <p className="text-xs text-destructive">{errors.repositoryUrl}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="docs">Documentation URL</Label>
            <Input
              id="docs"
              value={documentationUrl}
              onChange={(e) => {
                setDocumentationUrl(e.target.value);
                if (errors.documentationUrl) setErrors({ ...errors, documentationUrl: '' });
              }}
              placeholder="https://docs.example.com"
              className={errors.documentationUrl ? 'border-destructive' : ''}
            />
            {errors.documentationUrl && <p className="text-xs text-destructive">{errors.documentationUrl}</p>}
          </div>

          <div className="space-y-2">
            <Label>Project Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId} disabled={loadingUsers}>
              <SelectTrigger>
                <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select owner"} />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id.toString()}>
                    <div className="flex items-center gap-2">
                      <UserAvatar user={u} size="sm" />
                      <span>{u.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : project ? (
                'Update Project'
              ) : (
                'Create Project'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
