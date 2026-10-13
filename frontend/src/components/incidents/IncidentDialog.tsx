import { useState, useEffect } from 'react';
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
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

interface Incident {
  id: number;
  projectId: number;
  title: string;
  description?: string | null;
  severity: string;
  status: string;
  affectedServices?: string | null;
  rootCause?: string | null;
  resolution?: string | null;
}

interface IncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  incident?: Incident | null;
  onSuccess?: () => void;
}

const emptyForm = {
  title: '',
  description: '',
  severity: 'medium',
  status: 'open',
  affectedServices: '',
  rootCause: '',
  resolution: '',
};

export function IncidentDialog({
  open,
  onOpenChange,
  projectId,
  incident,
  onSuccess,
}: IncidentDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (incident) {
      setForm({
        title: incident.title || '',
        description: incident.description || '',
        severity: incident.severity || 'medium',
        status: incident.status || 'open',
        affectedServices: incident.affectedServices || '',
        rootCause: incident.rootCause || '',
        resolution: incident.resolution || '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [incident, open]);

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!form.severity) {
      toast.error('Severity is required');
      return;
    }

    setIsPending(true);
    try {
      const payload: any = {
        projectId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        severity: form.severity,
        status: form.status,
        affectedServices: form.affectedServices.trim() || null,
        rootCause: form.rootCause.trim() || null,
        resolution: form.resolution.trim() || null,
      };

      if (incident) {
        await apiClient.put(`/incidents/${incident.id}`, payload);
        toast.success('Incident updated');
      } else {
        await apiClient.post('/incidents', payload);
        toast.success('Incident reported');
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save incident');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={incident ? 'Edit Incident' : 'Report Incident'}
      description={incident ? 'Update incident details' : 'Report a new incident'}
      maxWidth="md"
      onSubmit={handleSubmit}
      submitLabel={incident ? 'Update' : 'Report'}
      isSubmitting={isPending}
    >
      <FormField label="Title" required>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g., API Gateway Timeout"
        />
      </FormField>

      <FormGrid>
        <FormField label="Severity" required>
          <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
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
        <FormField label="Status">
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="identified">Identified</SelectItem>
              <SelectItem value="monitoring">Monitoring</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </FormGrid>

      <FormField label="Description">
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe the incident..."
          rows={3}
        />
      </FormField>

      <FormField label="Affected Services">
        <Input
          value={form.affectedServices}
          onChange={(e) => setForm({ ...form, affectedServices: e.target.value })}
          placeholder="e.g., API, Database, Auth Service"
        />
      </FormField>

      {incident && (
        <>
          <FormField label="Root Cause">
            <Textarea
              value={form.rootCause}
              onChange={(e) => setForm({ ...form, rootCause: e.target.value })}
              placeholder="Root cause analysis"
              rows={2}
            />
          </FormField>
          <FormField label="Resolution">
            <Textarea
              value={form.resolution}
              onChange={(e) => setForm({ ...form, resolution: e.target.value })}
              placeholder="How was it resolved?"
              rows={2}
            />
          </FormField>
        </>
      )}
    </FormDialog>
  );
}
