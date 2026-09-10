import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

interface Service {
  id: number;
  projectId: number;
  environmentId?: number | null;
  infrastructureNodeId?: number | null;
  name: string;
  type: string;
  status: string;
  version?: string | null;
  port?: number | null;
  healthCheckUrl?: string | null;
  description?: string | null;
}

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  environments?: { id: number; name: string }[];
  nodes?: { id: number; name: string }[];
  service?: Service | null;
  onSuccess?: () => void;
}

const emptyForm = {
  name: '',
  type: 'web',
  status: 'active',
  version: '',
  port: '',
  healthCheckUrl: '',
  description: '',
  environmentId: '',
  infrastructureNodeId: '',
};

export function ServiceDialog({
  open,
  onOpenChange,
  projectId,
  environments = [],
  nodes = [],
  service,
  onSuccess,
}: ServiceDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (service) {
      setForm({
        name: service.name || '',
        type: service.type || 'web',
        status: service.status || 'active',
        version: service.version || '',
        port: service.port?.toString() || '',
        healthCheckUrl: service.healthCheckUrl || '',
        description: service.description || '',
        environmentId: service.environmentId?.toString() || '',
        infrastructureNodeId: service.infrastructureNodeId?.toString() || '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [service, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Service name is required');
      return;
    }

    setIsPending(true);
    try {
      const payload: any = {
        projectId,
        name: form.name.trim(),
        type: form.type,
        status: form.status,
        version: form.version.trim() || null,
        port: form.port ? parseInt(form.port) : null,
        healthCheckUrl: form.healthCheckUrl.trim() || null,
        description: form.description.trim() || null,
        environmentId: form.environmentId ? parseInt(form.environmentId) : null,
        infrastructureNodeId: form.infrastructureNodeId ? parseInt(form.infrastructureNodeId) : null,
      };

      if (service) {
        await apiClient.put(`/services/${service.id}`, payload);
        toast.success('Service updated');
      } else {
        await apiClient.post('/services', payload);
        toast.success('Service added');
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save service');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{service ? 'Edit Service' : 'Add Service'}</DialogTitle>
          <DialogDescription>
            {service ? 'Update service details' : 'Add a new service to this project'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Service Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., API Gateway"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="cache">Cache</SelectItem>
                  <SelectItem value="queue">Queue</SelectItem>
                  <SelectItem value="worker">Worker</SelectItem>
                  <SelectItem value="cron">Cron</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Version</Label>
              <Input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="e.g., v1.2.3"
              />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                placeholder="e.g., 8080"
              />
            </div>
          </div>

          {environments.length > 0 && (
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={form.environmentId} onValueChange={(v) => setForm({ ...form, environmentId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {environments.map((env) => (
                    <SelectItem key={env.id} value={env.id.toString()}>
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {nodes.length > 0 && (
            <div className="space-y-2">
              <Label>Server</Label>
              <Select value={form.infrastructureNodeId} onValueChange={(v) => setForm({ ...form, infrastructureNodeId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {nodes.map((node) => (
                    <SelectItem key={node.id} value={node.id.toString()}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Health Check URL</Label>
            <Input
              value={form.healthCheckUrl}
              onChange={(e) => setForm({ ...form, healthCheckUrl: e.target.value })}
              placeholder="https://example.com/health"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of the service"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {service ? 'Update' : 'Add Service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
