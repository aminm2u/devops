import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';

interface Asset {
  id: number;
  assetNumber: string;
  name: string;
  description?: string;
  category?: string;
  serialNumber?: string;
  purchasePrice: number;
  currentValue: number;
  purchaseDate?: string;
  warrantyExpiry?: string;
  location?: string;
  status: string;
  assignedTo?: { id: number; name: string };
  project?: { id: number; name: string };
}

export function AssetListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [purchaseDate, setPurchaseDate] = useState('');
  const [warrantyExpiry, setWarrantyExpiry] = useState('');

  useEffect(() => {
    setPurchaseDate(editingAsset?.purchaseDate?.split('T')[0] || '');
    setWarrantyExpiry(editingAsset?.warrantyExpiry?.split('T')[0] || '');
  }, [editingAsset, isCreateOpen]);
  const queryClient = useQueryClient();

  const { data: assetCategories } = useReferenceData('asset_category');

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets', search, statusFilter, categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      return apiClient.get(`/assets?${params}`).then((r) => r.data.data);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/assets', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setIsCreateOpen(false);
      toast.success('Asset created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiClient.put(`/assets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setIsCreateOpen(false);
      setEditingAsset(null);
      toast.success('Asset updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/assets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast.success('Asset decommissioned');
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      description: formData.get('description') || null,
      category: formData.get('category') || null,
      serialNumber: formData.get('serialNumber') || null,
      purchasePrice: parseFloat(formData.get('purchasePrice') as string) || 0,
      currentValue: parseFloat(formData.get('currentValue') as string) || 0,
      purchaseDate: purchaseDate || null,
      warrantyExpiry: warrantyExpiry || null,
      location: formData.get('location') || null,
      status: formData.get('status') || 'active',
    };

    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open) {
      setEditingAsset(null);
    }
  };

  const columns: DataTableColumn<Asset>[] = [
    {
      key: 'assetNumber',
      header: 'Asset Number',
      accessor: (asset) => <span className="font-mono font-medium">{asset.assetNumber}</span>,
      sortValue: (asset) => asset.assetNumber,
      sortable: true,
    },
    {
      key: 'name',
      header: 'Name',
      accessor: (asset) => asset.name,
      sortable: true,
    },
    {
      key: 'category',
      header: 'Category',
      accessor: (asset) => (asset.category ? <Badge variant="outline">{asset.category}</Badge> : '-'),
    },
    {
      key: 'serialNumber',
      header: 'Serial No',
      accessor: (asset) => asset.serialNumber || '-',
    },
    {
      key: 'purchasePrice',
      header: 'Purchase Price',
      accessor: (asset) => `MYR ${asset.purchasePrice.toLocaleString()}`,
      sortValue: (asset) => asset.purchasePrice,
      sortable: true,
    },
    {
      key: 'location',
      header: 'Location',
      accessor: (asset) => asset.location || '-',
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (asset) => <StatusBadge domain="asset" value={asset.status} />,
      sortValue: (asset) => asset.status,
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (asset) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditingAsset(asset); setIsCreateOpen(true); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(asset.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Asset Register" description="Track and manage registered assets">
        <Button onClick={() => { setEditingAsset(null); setIsCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Register Asset
        </Button>
      </PageHeader>

      <FormDialog
        key={editingAsset?.id || 'new'}
        open={isCreateOpen}
        onOpenChange={handleOpenChange}
        title={editingAsset ? 'Edit Asset' : 'Register New Asset'}
        description={editingAsset ? 'Update asset details and status' : 'Enter asset specifications to register'}
        maxWidth="lg"
        onSubmit={handleSubmit}
        submitLabel={editingAsset ? 'Update' : 'Register'}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Name *</Label><Input name="name" defaultValue={editingAsset?.name} required /></div>
          <div className="col-span-2"><Label>Description</Label><Input name="description" defaultValue={editingAsset?.description} /></div>
          <div><Label>Category</Label>
            <Select name="category" defaultValue={editingAsset?.category || ''}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {toSelectOptions(assetCategories).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Serial Number</Label><Input name="serialNumber" defaultValue={editingAsset?.serialNumber} /></div>
          <div><Label>Purchase Price (MYR)</Label><Input name="purchasePrice" type="number" step="0.01" defaultValue={editingAsset?.purchasePrice} /></div>
          <div><Label>Current Value (MYR)</Label><Input name="currentValue" type="number" step="0.01" defaultValue={editingAsset?.currentValue} /></div>
          <div><Label>Purchase Date</Label><DatePicker value={purchaseDate} onChange={setPurchaseDate} /></div>
          <div><Label>Warranty Expiry</Label><DatePicker value={warrantyExpiry} onChange={setWarrantyExpiry} /></div>
          <div className="col-span-2"><Label>Location</Label><Input name="location" defaultValue={editingAsset?.location} /></div>
          <div><Label>Status</Label>
            <Select name="status" defaultValue={editingAsset?.status || 'active'}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="disposed">Disposed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormDialog>

      <DataTable
        columns={columns}
        data={assets}
        loading={isLoading}
        search={{ value: search, onChange: setSearch, placeholder: 'Search assets...' }}
        filters={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="disposed">Disposed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {toSelectOptions(assetCategories).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        emptyTitle="No assets found"
      />
    </div>
  );
}
