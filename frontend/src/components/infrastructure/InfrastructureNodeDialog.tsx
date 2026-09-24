import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

interface InfrastructureNode {
  id: number;
  projectId: number;
  environmentId?: number | null;
  name: string;
  hostname: string;
  ipAddress: string;
  type: string;
  status: string;
  operatingSystem?: string | null;
  cpuCores?: number | null;
  memoryGb?: number | null;
  storageGb?: number | null;
  provider?: string | null;
  providerRegion?: string | null;
  username?: string | null;
  password?: string | null;
  metadata?: any;
}

interface InfrastructureNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  environmentId?: number | null;
  node?: InfrastructureNode | null;
  onSuccess?: () => void;
}

const emptyForm = {
  name: '',
  hostname: '',
  ipAddress: '',
  type: 'server',
  status: 'active',
  operatingSystem: '',
  cpuCores: '',
  memoryGb: '',
  storageGb: '',
  provider: '',
  providerRegion: '',
  username: '',
  password: '',
  description: '',
};

export function InfrastructureNodeDialog({
  open,
  onOpenChange,
  projectId,
  environmentId,
  node,
  onSuccess,
}: InfrastructureNodeDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (node) {
      setForm({
        name: node.name || '',
        hostname: node.hostname || '',
        ipAddress: node.ipAddress || '',
        type: node.type || 'server',
        status: node.status || 'active',
        operatingSystem: node.operatingSystem || '',
        cpuCores: node.cpuCores?.toString() || '',
        memoryGb: node.memoryGb?.toString() || '',
        storageGb: node.storageGb?.toString() || '',
        provider: node.provider || '',
        providerRegion: node.providerRegion || '',
        username: node.username || '',
        password: node.password || '',
        description: '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [node, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Node name is required');
      return;
    }
    if (!form.ipAddress.trim()) {
      toast.error('IP address is required');
      return;
    }

    setIsPending(true);
    try {
      const payload: any = {
        projectId,
        name: form.name.trim(),
        hostname: form.hostname.trim() || null,
        ipAddress: form.ipAddress.trim(),
        type: form.type,
        status: form.status,
        operatingSystem: form.operatingSystem.trim() || null,
        cpuCores: form.cpuCores ? parseInt(form.cpuCores) : null,
        memoryGb: form.memoryGb ? parseFloat(form.memoryGb) : null,
        storageGb: form.storageGb ? parseFloat(form.storageGb) : null,
        provider: form.provider.trim() || null,
        providerRegion: form.providerRegion.trim() || null,
        username: form.username.trim() || null,
        password: form.password || null,
        isActive: true,
      };

      if (environmentId) {
        payload.environmentId = environmentId;
      }

      if (node) {
        await apiClient.put(`/infrastructure/${node.id}`, payload);
        toast.success('Server updated');
      } else {
        await apiClient.post('/infrastructure', payload);
        toast.success('Server added');
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save server');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        <Card className='pt-8 border-0 shadow-none'>
          <CardHeader>
            <CardTitle>{node ? 'Edit Server' : 'Add Server'}</CardTitle>
            <CardDescription>
              {node ? 'Update server specifications and credentials' : 'Add a new server to this project'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Server Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Web Server 1"
                />
              </div>
              <div className="space-y-2">
                <Label>Hostname</Label>
                <Input
                  value={form.hostname}
                  onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                  placeholder="e.g., web01.prod"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IP Address *</Label>
                <Input
                  value={form.ipAddress}
                  onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                  placeholder="e.g., 192.168.1.100"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="server">Server</SelectItem>
                    <SelectItem value="database">Database</SelectItem>
                    <SelectItem value="cache">Cache</SelectItem>
                    <SelectItem value="load-balancer">Load Balancer</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operating System</Label>
                <Input
                  value={form.operatingSystem}
                  onChange={(e) => setForm({ ...form, operatingSystem: e.target.value })}
                  placeholder="e.g., Ubuntu 22.04 LTS"
                />
              </div>
            </div>
          </div>

          {/* Hardware Specs */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Hardware Specifications</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>CPU Cores</Label>
                <Input
                  type="number"
                  value={form.cpuCores}
                  onChange={(e) => setForm({ ...form, cpuCores: e.target.value })}
                  placeholder="e.g., 8"
                />
              </div>
              <div className="space-y-2">
                <Label>Memory (GB)</Label>
                <Input
                  type="number"
                  value={form.memoryGb}
                  onChange={(e) => setForm({ ...form, memoryGb: e.target.value })}
                  placeholder="e.g., 32"
                />
              </div>
              <div className="space-y-2">
                <Label>Storage (GB)</Label>
                <Input
                  type="number"
                  value={form.storageGb}
                  onChange={(e) => setForm({ ...form, storageGb: e.target.value })}
                  placeholder="e.g., 500"
                />
              </div>
            </div>
          </div>

          {/* Cloud Info */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Cloud Provider (Optional)</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aws">AWS</SelectItem>
                    <SelectItem value="gcp">Google Cloud</SelectItem>
                    <SelectItem value="azure">Azure</SelectItem>
                    <SelectItem value="digitalocean">DigitalOcean</SelectItem>
                    <SelectItem value="linode">Linode</SelectItem>
                    <SelectItem value="vultr">Vultr</SelectItem>
                    <SelectItem value="on-premise">On-Premise</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Input
                  value={form.providerRegion}
                  onChange={(e) => setForm({ ...form, providerRegion: e.target.value })}
                  placeholder="e.g., ap-southeast-1"
                />
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Server Credentials</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g., ubuntu, root"
                />
              </div>
              <div className="space-y-2">
                <Label>Password / SSH Key</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Enter password or paste SSH key"
                />
              </div>
            </div>
          </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {node ? 'Update' : 'Add Server'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
