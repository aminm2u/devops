import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={node ? 'Edit Server' : 'Add Server'}
      description={node ? 'Update server specifications and credentials' : 'Add a new server to this project'}
      maxWidth="lg"
      onSubmit={handleSubmit}
      submitLabel={node ? 'Update' : 'Add Server'}
      isSubmitting={isPending}
    >
      {/* Basic Info */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">Basic Information</h4>
        <FormGrid>
          <FormField label="Server Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Web Server 1"
            />
          </FormField>
          <FormField label="Hostname">
            <Input
              value={form.hostname}
              onChange={(e) => setForm({ ...form, hostname: e.target.value })}
              placeholder="e.g., web01.prod"
            />
          </FormField>
        </FormGrid>
        <FormGrid>
          <FormField label="IP Address" required>
            <Input
              value={form.ipAddress}
              onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
              placeholder="e.g., 192.168.1.100"
            />
          </FormField>
          <FormField label="Type">
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
          </FormField>
        </FormGrid>
        <FormGrid>
          <FormField label="Status">
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
          </FormField>
          <FormField label="Operating System">
            <Input
              value={form.operatingSystem}
              onChange={(e) => setForm({ ...form, operatingSystem: e.target.value })}
              placeholder="e.g., Ubuntu 22.04 LTS"
            />
          </FormField>
        </FormGrid>
      </div>

      {/* Hardware Specs */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">Hardware Specifications</h4>
        <FormGrid columns={3}>
          <FormField label="CPU Cores">
            <Input
              type="number"
              value={form.cpuCores}
              onChange={(e) => setForm({ ...form, cpuCores: e.target.value })}
              placeholder="e.g., 8"
            />
          </FormField>
          <FormField label="Memory (GB)">
            <Input
              type="number"
              value={form.memoryGb}
              onChange={(e) => setForm({ ...form, memoryGb: e.target.value })}
              placeholder="e.g., 32"
            />
          </FormField>
          <FormField label="Storage (GB)">
            <Input
              type="number"
              value={form.storageGb}
              onChange={(e) => setForm({ ...form, storageGb: e.target.value })}
              placeholder="e.g., 500"
            />
          </FormField>
        </FormGrid>
      </div>

      {/* Cloud Info */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">Cloud Provider (Optional)</h4>
        <FormGrid>
          <FormField label="Provider">
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
          </FormField>
          <FormField label="Region">
            <Input
              value={form.providerRegion}
              onChange={(e) => setForm({ ...form, providerRegion: e.target.value })}
              placeholder="e.g., ap-southeast-1"
            />
          </FormField>
        </FormGrid>
      </div>

      {/* Credentials */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">Server Credentials</h4>
        <FormGrid>
          <FormField label="Username">
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="e.g., ubuntu, root"
            />
          </FormField>
          <FormField label="Password / SSH Key">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Enter password or paste SSH key"
            />
          </FormField>
        </FormGrid>
      </div>
    </FormDialog>
  );
}
