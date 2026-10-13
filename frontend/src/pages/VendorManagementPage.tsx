import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormDialog } from '@/components/ui/form-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { Plus, Pencil, Trash2, Star } from 'lucide-react';
import toast from 'react-hot-toast';

interface Vendor {
  id: number;
  name: string;
  registrationNo?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  bankName?: string;
  bankAccountNo?: string;
  taxId?: string;
  category?: string;
  rating?: number;
  isActive: boolean;
}

export function VendorManagementPage() {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const queryClient = useQueryClient();

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', search],
    queryFn: () => apiClient.get(`/vendors?search=${search}`).then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/vendors', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setIsDialogOpen(false);
      toast.success('Vendor created successfully');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiClient.put(`/vendors/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setIsDialogOpen(false);
      setEditingVendor(null);
      toast.success('Vendor updated successfully');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/vendors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor deleted');
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      registrationNo: formData.get('registrationNo') as string || null,
      contactPerson: formData.get('contactPerson') as string || null,
      email: formData.get('email') as string || null,
      phone: formData.get('phone') as string || null,
      address: formData.get('address') as string || null,
      bankName: formData.get('bankName') as string || null,
      bankAccountNo: formData.get('bankAccountNo') as string || null,
      taxId: formData.get('taxId') as string || null,
      category: formData.get('category') as string || null,
    };

    if (editingVendor) {
      updateMutation.mutate({ id: editingVendor.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingVendor(null);
    }
  };

  const columns: DataTableColumn<Vendor>[] = [
    {
      key: 'name',
      header: 'Name',
      accessor: (vendor) => <span className="font-medium">{vendor.name}</span>,
      sortValue: (vendor) => vendor.name,
      sortable: true,
    },
    {
      key: 'contactPerson',
      header: 'Contact Person',
      accessor: (vendor) => vendor.contactPerson || '-',
    },
    {
      key: 'email',
      header: 'Email',
      accessor: (vendor) => vendor.email || '-',
    },
    {
      key: 'phone',
      header: 'Phone',
      accessor: (vendor) => vendor.phone || '-',
    },
    {
      key: 'category',
      header: 'Category',
      accessor: (vendor) => vendor.category || '-',
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (vendor) =>
        vendor.rating ? (
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-3 w-3 ${i < vendor.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
            ))}
          </div>
        ) : (
          '-'
        ),
      sortValue: (vendor) => vendor.rating ?? null,
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (vendor) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditingVendor(vendor); setIsDialogOpen(true); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(vendor.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Vendors" description="Manage your vendor/supplier registry">
        <Button onClick={() => { setEditingVendor(null); setIsDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Vendor
        </Button>
      </PageHeader>

      <FormDialog
        key={editingVendor?.id || 'new'}
        open={isDialogOpen}
        onOpenChange={handleOpenChange}
        title={editingVendor ? 'Edit Vendor' : 'Add Vendor'}
        description={editingVendor ? 'Update vendor details in the registry' : 'Register a new vendor or supplier'}
        maxWidth="lg"
        onSubmit={handleSubmit}
        submitLabel={editingVendor ? 'Update' : 'Create'}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Name *</Label><Input name="name" defaultValue={editingVendor?.name} required /></div>
          <div><Label>Registration No</Label><Input name="registrationNo" defaultValue={editingVendor?.registrationNo} /></div>
          <div><Label>Contact Person</Label><Input name="contactPerson" defaultValue={editingVendor?.contactPerson} /></div>
          <div><Label>Email</Label><Input name="email" type="email" defaultValue={editingVendor?.email} /></div>
          <div><Label>Phone</Label><Input name="phone" defaultValue={editingVendor?.phone} /></div>
          <div><Label>Category</Label><Input name="category" defaultValue={editingVendor?.category} /></div>
          <div><Label>Bank Name</Label><Input name="bankName" defaultValue={editingVendor?.bankName} /></div>
          <div><Label>Bank Account No</Label><Input name="bankAccountNo" defaultValue={editingVendor?.bankAccountNo} /></div>
          <div><Label>Tax ID</Label><Input name="taxId" defaultValue={editingVendor?.taxId} /></div>
        </div>
        <div><Label>Address</Label><Textarea name="address" defaultValue={editingVendor?.address} /></div>
      </FormDialog>

      <DataTable
        columns={columns}
        data={vendors}
        loading={isLoading}
        search={{ value: search, onChange: setSearch, placeholder: 'Search vendors...' }}
        emptyTitle="No vendors found"
      />
    </div>
  );
}
