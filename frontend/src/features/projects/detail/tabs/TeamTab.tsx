import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { UserPlus, UserCheck, UserMinus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import { projectsApi } from '@/api/projects';
import toast from '@/lib/toast';

/**
 * The project team.
 *
 * Two ways in, deliberately different:
 *  - **Enroll myself** → `POST /:id/enroll`, only offered when the project has
 *    `allowSelfEnroll`. The server picks the role; nothing here can ask for a
 *    better one.
 *  - **Add member** → `POST /:id/members`, requires `project.team.manage`.
 *
 * The old "enroll self" path went through the manage endpoint with a
 * hard-coded `projectRoleId: 3`, which matched no row — so self-enrollment had
 * never actually worked.
 */
export function TeamTab({ project, refetch }: { project: any; refetch: () => void }) {
  const { user, can } = useAuth();
  const members = (project.teamAssignments || []).filter((m: any) => m.isActive !== false);
  const [loading, setLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<any>(null);

  // Form state
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  const canManageTeam = can('project.team.manage');
  const canSelfEnroll = can('project.team.enroll.self');
  const isMember = members.some((m: any) => m.userId === user?.id);

  useEffect(() => {
    if (!inviteOpen) return;
    if (users.length === 0) {
      apiClient
        .get('/admin/users')
        .then((res) => setUsers(res.data.data))
        .catch(() => toast.error('Could not load the user list'));
    }
    if (roles.length === 0) {
      apiClient
        .get('/references')
        .then((res) => setRoles(res.data.data.projectRoles ?? []))
        .catch(() => toast.error('Could not load project roles'));
    }
    // `users.length`/`roles.length` are the cache check, so re-running when they
    // fill would loop; the guard above makes the extra deps harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteOpen]);

  const enrollSelf = async () => {
    try {
      setLoading(true);
      await projectsApi.enroll(project.id);
      toast.success('You joined the project team');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to enroll');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!selectedUser || !selectedRole) {
      toast.error('Please select a user and a role');
      return;
    }
    try {
      setLoading(true);
      await apiClient.post(`/projects/${project.id}/members`, {
        userId: Number(selectedUser),
        projectRoleId: Number(selectedRole),
      });
      toast.success('Member added');
      setInviteOpen(false);
      setSelectedUser('');
      setSelectedRole('');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!removing) return;
    try {
      setLoading(true);
      await apiClient.delete(`/projects/${project.id}/members/${removing.userId}`);
      toast.success(`${removing.user?.name ?? 'Member'} removed from the team`);
      setRemoving(null);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Project Team</h2>
          <p className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? 'member' : 'members'} — time logged here feeds
            this project&apos;s contribution.
          </p>
        </div>
        <div className="flex gap-2">
          {!isMember && canSelfEnroll && project.allowSelfEnroll && (
            <Button onClick={enrollSelf} disabled={loading} variant="outline">
              <UserCheck className="mr-2 h-4 w-4" />
              Join team
            </Button>
          )}
          {canManageTeam && (
            <Button onClick={() => setInviteOpen(true)} disabled={loading}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add member
            </Button>
          )}
        </div>
      </div>

      {!isMember && !project.allowSelfEnroll && !canManageTeam && (
        <p className="rounded-lg border dark:border-gray-800 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          This project is not open to self-enrollment. Ask the project lead to add you.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {members.map((assignment: any) => (
          <Card key={assignment.id}>
            <CardContent className="flex items-center gap-4 p-6">
              <UserAvatar user={assignment.user} size="lg" className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold">
                  {assignment.user?.name}
                  {assignment.userId === project.ownerId && (
                    <Badge variant="outline" className="ml-2 border-primary/40 text-primary">
                      Owner
                    </Badge>
                  )}
                </h3>
                <p className="truncate text-sm text-slate-500">{assignment.user?.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="secondary">
                    {assignment.projectRole?.name ?? 'Member'}
                  </Badge>
                  {canManageTeam && assignment.userId !== project.ownerId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                      onClick={() => setRemoving(assignment)}
                    >
                      <UserMinus className="mr-1 h-3 w-3" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {members.length === 0 && (
          <p className="col-span-full text-slate-500">
            No members enrolled in this project yet.
          </p>
        )}
      </div>

      <FormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Add team member"
        description="Add an existing user to this project team"
        maxWidth="sm"
        onSubmit={handleInvite}
        submitLabel="Add"
        isSubmitting={loading}
      >
        <div className="space-y-2">
          <Label>User</Label>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a user..." />
            </SelectTrigger>
            <SelectContent>
              {users
                // Already on the team — re-adding would just 409.
                .filter((u) => !members.some((m: any) => m.userId === u.id))
                .map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Project role</Label>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger>
              <SelectValue placeholder="Assign a role..." />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove from team?"
        description={
          <>
            <strong>{removing?.user?.name}</strong> loses access to this project and its records.
            Hours they already logged stay on the project.
          </>
        }
        confirmLabel="Remove"
        isConfirming={loading}
        onConfirm={handleRemove}
      />
    </div>
  );
}
