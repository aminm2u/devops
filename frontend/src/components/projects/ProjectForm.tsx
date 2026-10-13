import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { FormField } from '@/components/ui/form-field';
import { FormGrid } from '@/components/ui/form-grid';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import type { Project } from '@/types';

interface ProjectFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function ProjectForm({ open, onOpenChange, project, onSubmit, onCancel, isLoading }: ProjectFormProps) {
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={project ? 'Edit Project' : 'Create New Project'}
      description={project ? 'Update project details' : 'Fill in the details to create a new project'}
      maxWidth="xl"
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel={project ? 'Update Project' : 'Create Project'}
      isSubmitting={isLoading}
    >
      <FormField label="Project Name" htmlFor="name" required error={errors.name || undefined}>
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
      </FormField>

      <FormField label="Description" htmlFor="description">
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of the project"
          rows={3}
        />
      </FormField>

      <FormGrid>
        <FormField label="Status">
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
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
        </FormField>

        <FormField label="Priority">
          <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
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
        </FormField>
      </FormGrid>

      <FormField label="Repository URL" htmlFor="repo" error={errors.repositoryUrl || undefined}>
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
      </FormField>

      <FormField label="Documentation URL" htmlFor="docs" error={errors.documentationUrl || undefined}>
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
      </FormField>

      <FormField label="Project Owner">
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
      </FormField>
    </FormDialog>
  );
}
