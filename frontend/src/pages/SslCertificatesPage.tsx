import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/ui/date-picker';
import apiClient from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatDate, getStatusColor, formatStatus } from '@/lib/utils';
import toast from 'react-hot-toast';

interface SslCertificate {
  id: number;
  projectId: number;
  domainId: number;
  name: string;
  type: string;
  status: string;
  issuer: string | null;
  subject: string | null;
  serialNumber: string | null;
  fingerprint: string | null;
  notBefore: string | null;
  notAfter: string | null;
  autoRenew: boolean;
  certificatePath: string | null;
  privateKeyPath: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  project?: { id: number; name: string; slug: string };
  domain?: { id: number; name: string };
  daysUntilExpiry?: number | null;
}

const emptyForm = {
  projectId: 0,
  domainId: 0,
  name: '',
  type: 'letsencrypt',
  issuer: '',
  subject: '',
  serialNumber: '',
  fingerprint: '',
  notBefore: '',
  notAfter: '',
  autoRenew: true,
  certificatePath: '',
  privateKeyPath: '',
};

export function SslCertificatesPage() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canManage = hasRole('super-admin') || hasRole('devops-admin');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expiringFilter, setExpiringFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<SslCertificate | null>(null);
  const [editingCert, setEditingCert] = useState<SslCertificate | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['ssl', search, statusFilter, expiringFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (expiringFilter) params.expiringSoon = 'true';
      const res = await apiClient.get('/ssl', { params });
      return res.data;
    },
  });

  // Separate query for stats (fetches all certificates without pagination)
  const { data: statsData } = useQuery({
    queryKey: ['ssl-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/ssl', { params: { limit: 1000 } });
      return res.data;
    },
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await apiClient.get('/projects', { params: { limit: 100 } });
      return res.data;
    },
  });

  const { data: domainsData } = useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      const res = await apiClient.get('/domains', { params: { limit: 100 } });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiClient.post('/ssl', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl'] });
      setShowFormDialog(false);
      setForm(emptyForm);
      toast.success('SSL certificate created');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create certificate'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiClient.put(`/ssl/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl'] });
      setShowFormDialog(false);
      setEditingCert(null);
      setForm(emptyForm);
      toast.success('SSL certificate updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update certificate'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/ssl/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl'] });
      setShowDeleteDialog(null);
      toast.success('SSL certificate deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete certificate'),
  });

  const renewMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(`/ssl/${id}/renew`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl'] });
      toast.success('Certificate renewal initiated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to renew certificate'),
  });

  const openCreateDialog = () => {
    setEditingCert(null);
    setForm({
      ...emptyForm,
      projectId: projectsData?.data?.[0]?.id || 0,
    });
    setShowFormDialog(true);
  };

  const openEditDialog = (cert: SslCertificate) => {
    setEditingCert(cert);
    setForm({
      projectId: cert.projectId,
      domainId: cert.domainId,
      name: cert.name,
      type: cert.type,
      issuer: cert.issuer || '',
      subject: cert.subject || '',
      serialNumber: cert.serialNumber || '',
      fingerprint: cert.fingerprint || '',
      notBefore: cert.notBefore ? new Date(cert.notBefore).toISOString().split('T')[0] : '',
      notAfter: cert.notAfter ? new Date(cert.notAfter).toISOString().split('T')[0] : '',
      autoRenew: cert.autoRenew,
      certificatePath: cert.certificatePath || '',
      privateKeyPath: cert.privateKeyPath || '',
    });
    setShowFormDialog(true);
  };

  const handleFormSubmit = () => {
    if (!form.name.trim()) {
      toast.error('Certificate name is required');
      return;
    }
    const payload: any = {
      projectId: form.projectId || projectsData?.data?.[0]?.id,
      domainId: form.domainId || undefined,
      name: form.name.trim(),
      type: form.type,
      issuer: form.issuer.trim() || null,
      subject: form.subject.trim() || null,
      serialNumber: form.serialNumber.trim() || null,
      fingerprint: form.fingerprint.trim() || null,
      notBefore: form.notBefore ? new Date(form.notBefore + 'T00:00:00').toISOString() : null,
      notAfter: form.notAfter ? new Date(form.notAfter + 'T00:00:00').toISOString() : null,
      autoRenew: form.autoRenew,
      certificatePath: form.certificatePath.trim() || null,
      privateKeyPath: form.privateKeyPath.trim() || null,
    };

    if (editingCert) {
      updateMutation.mutate({ id: editingCert.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const certificates: SslCertificate[] = data?.data || [];
  const meta = data?.meta;
  const projects = projectsData?.data || [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Use statsData for calculating stats (all certificates, not just current page)
  const allCertificates: SslCertificate[] = statsData?.data || [];
  const stats = {
    total: meta?.total || allCertificates.length,
    valid: allCertificates.filter((c) => c.status === 'valid' && (!c.daysUntilExpiry || c.daysUntilExpiry > 30)).length,
    expiringSoon: allCertificates.filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry !== undefined && c.daysUntilExpiry <= 30 && c.daysUntilExpiry > 0).length,
    expired: allCertificates.filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry !== undefined && c.daysUntilExpiry <= 0).length,
  };

  const getExpiryBadge = (daysUntilExpiry: number | null | undefined) => {
    if (daysUntilExpiry === null || daysUntilExpiry === undefined) {
      return <Badge variant="outline">Unknown</Badge>;
    }
    if (daysUntilExpiry <= 0) {
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Expired</Badge>;
    }
    if (daysUntilExpiry <= 7) {
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{daysUntilExpiry}d</Badge>;
    }
    if (daysUntilExpiry <= 30) {
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{daysUntilExpiry}d</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{daysUntilExpiry}d</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">SSL Certificates</h1>
          <p className="text-muted-foreground">Manage and monitor SSL/TLS certificates</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Certificate
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Certificates</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Shield className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valid</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.valid}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expiring Soon</p>
                <p className="text-2xl font-bold text-amber-600">{stats.expiringSoon}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Input
            placeholder="Search certificates..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="valid">Valid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="renewing">Renewing</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={expiringFilter ? "default" : "outline"}
          onClick={() => { setExpiringFilter(!expiringFilter); setPage(1); }}
        >
          <Clock className="mr-2 h-4 w-4" />
          Expiring Soon
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto px-4">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-6 w-[100px]" />
                  <Skeleton className="h-6 w-[80px]" />
                  <Skeleton className="h-4 w-[100px]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-destructive">Failed to load certificates</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
            </div>
          ) : certificates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Shield className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No SSL certificates found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issuer</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Auto-Renew</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((cert) => (
                  <TableRow key={cert.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        {cert.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{cert.domain?.name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{cert.project?.name || '-'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatStatus(cert.type)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(getStatusColor(cert.status))}>{formatStatus(cert.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{cert.issuer || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cert.notAfter ? formatDate(cert.notAfter) : '-'}</span>
                        {getExpiryBadge(cert.daysUntilExpiry)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cert.autoRenew ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                          {cert.daysUntilExpiry !== null && cert.daysUntilExpiry !== undefined && cert.daysUntilExpiry <= 30 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => renewMutation.mutate(cert.id)}
                              disabled={renewMutation.isPending}
                              title="Renew certificate"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(cert)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setShowDeleteDialog(cert)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.lastPage > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.currentPage} of {meta.lastPage} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto py-4 px-6">
          <DialogHeader>
            <DialogTitle>{editingCert ? 'Edit Certificate' : 'Add Certificate'}</DialogTitle>
            <DialogDescription>
              {editingCert ? 'Update the SSL certificate details' : 'Add a new SSL certificate'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Certificate Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Main Website SSL" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={String(form.projectId)} onValueChange={(v) => setForm({ ...form, projectId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="letsencrypt">Let's Encrypt</SelectItem>
                    <SelectItem value="self-signed">Self-Signed</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valid From</Label>
                <DatePicker value={form.notBefore} onChange={(v) => setForm({ ...form, notBefore: v })} />
              </div>
              <div className="space-y-2">
                <Label>Expires At</Label>
                <DatePicker value={form.notAfter} onChange={(v) => setForm({ ...form, notAfter: v })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Issuer</Label>
              <Input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="e.g., Let's Encrypt" />
            </div>
            <div className="space-y-2">
              <Label>Subject / Common Name</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g., *.example.com" />
            </div>
            <div className="flex items-center space-x-2">
              <Button
                type="button"
                variant={form.autoRenew ? "default" : "outline"}
                size="sm"
                onClick={() => setForm({ ...form, autoRenew: !form.autoRenew })}
              >
                {form.autoRenew ? "Auto-renew: ON" : "Auto-renew: OFF"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFormDialog(false); setEditingCert(null); }}>Cancel</Button>
            <Button onClick={handleFormSubmit} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingCert ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <DialogContent className='pt-12 pb-6 px-6'>
          <DialogHeader>
            <DialogTitle>Delete Certificate</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{showDeleteDialog?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='mt-4'>
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteDialog && deleteMutation.mutate(showDeleteDialog.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
