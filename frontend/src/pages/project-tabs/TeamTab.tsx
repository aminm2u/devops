import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { UserPlus, UserCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

export function TeamTab({ project, refetch }: { project: any, refetch: () => void }) {
  const { user } = useAuth();
  const members = project.teamAssignments || [];
  const [loading, setLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Form State
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  const isMember = members.some((m: any) => m.userId === user?.id);

  useEffect(() => {
    if (inviteOpen && users.length === 0) {
      apiClient.get('/admin/users').then(res => setUsers(res.data.data)).catch(console.error);
      apiClient.get('/references').then(res => setRoles(res.data.data.projectRoles)).catch(console.error);
    }
  }, [inviteOpen]);

  const enrollSelf = async () => {
    try {
      setLoading(true);
      await apiClient.post(`/projects/${project.id}/members`, {
        userId: user?.id,
        projectRoleId: 3 // Developer by default
      });
      toast.success('Successfully enrolled in project');
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
        userId: selectedUser,
        projectRoleId: selectedRole
      });
      toast.success('Member invited successfully');
      setInviteOpen(false);
      setSelectedUser('');
      setSelectedRole('');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to invite member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Project Team</h2>
        <div className="flex gap-2">
          {!isMember && (
            <Button onClick={enrollSelf} disabled={loading} variant="outline">
              <UserCheck className="w-4 h-4 mr-2" />
              Enroll Myself
            </Button>
          )}
          <Button onClick={() => setInviteOpen(true)} disabled={loading}>
            <UserPlus className="w-4 h-4 mr-2" />
            Invite Member
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {members.map((assignment: any) => (
          <Card key={assignment.id}>
            <CardContent className="p-6 flex items-center gap-4">
              <UserAvatar user={assignment.user} size="lg" className="h-12 w-12" />
              <div>
                <h3 className="font-semibold">{assignment.user.name}</h3>
                <p className="text-sm text-slate-500">{assignment.user.email}</p>
                <div className="mt-2">
                  <Badge variant="secondary">
                    {assignment.projectRole ? assignment.projectRole.name : 'Member'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {members.length === 0 && (
          <p className="text-slate-500 col-span-3">No members enrolled in this project yet.</p>
        )}
      </div>

      <FormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite Team Member"
        description="Add an existing user to this project team"
        maxWidth="sm"
        onSubmit={handleInvite}
        submitLabel="Invite"
        isSubmitting={loading}
      >
        <div className="space-y-2">
          <Label>Select User</Label>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a user..." />
            </SelectTrigger>
            <SelectContent>
              {users.map(u => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.email})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Project Role</Label>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger>
              <SelectValue placeholder="Assign a role..." />
            </SelectTrigger>
            <SelectContent>
              {roles.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FormDialog>
    </div>
  );
}