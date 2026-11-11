import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, ImagePlus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import toast from '@/lib/toast';
import apiClient from '@/api/client';

/**
 * Company details — the identity document generation will consume and the
 * public portal displays (name + logo). Stored as `Setting` rows under the
 * `company` group; saved through the bulk settings route, which needs the
 * `{ settings: [...] }` wrapper (a flat map fails validation).
 *
 * The logo uploads immediately on file pick (to /api/branding/logo) and its
 * URL rides in form state until Save persists `company.logoUrl`. Removing it
 * here only clears the field — the server keeps the file until another
 * upload replaces it, which is fine: nothing serves it once the setting is
 * gone.
 */

const PREFIX = 'company.';

interface CompanyForm {
  name: string;
  logoUrl: string;
  registrationNo: string;
  taxId: string;
  address: string;
  email: string;
  phone: string;
  website: string;
}

const EMPTY: CompanyForm = {
  name: '',
  logoUrl: '',
  registrationNo: '',
  taxId: '',
  address: '',
  email: '',
  phone: '',
  website: '',
};

export function CompanySettingsTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanyForm>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: settingsMap, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const res = await apiClient.get('/settings', { params: { group: 'company' } });
      return res.data.data as Record<string, unknown>;
    },
  });

  useEffect(() => {
    if (!settingsMap || loaded) return;
    const read = (key: keyof CompanyForm): string => {
      const v = settingsMap[`${PREFIX}${key}`];
      return typeof v === 'string' ? v : '';
    };
    setForm({
      name: read('name'),
      logoUrl: read('logoUrl'),
      registrationNo: read('registrationNo'),
      taxId: read('taxId'),
      address: read('address'),
      email: read('email'),
      phone: read('phone'),
      website: read('website'),
    });
    setLoaded(true);
  }, [settingsMap, loaded]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = (Object.keys(EMPTY) as Array<keyof CompanyForm>).map((key) => ({
        key: `${PREFIX}${key}`,
        value: form[key],
        group: 'company',
      }));
      await apiClient.put('/settings', { settings: entries });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      queryClient.invalidateQueries({ queryKey: ['public-branding'] });
      toast.success('Company details saved');
    },
    onError: () => toast.error('Failed to save company details'),
  });

  const logoUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form_ = new FormData();
      form_.append('logo', file);
      const res = await apiClient.post('/branding/logo', form_, {
        headers: { 'Content-Type': undefined },
      });
      return res.data.data as { logoUrl: string };
    },
    onSuccess: ({ logoUrl }) => {
      setForm((f) => ({ ...f, logoUrl }));
      toast.success('Logo uploaded — press Save to apply');
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string; error?: string } } };
      toast.error(ax.response?.data?.message || ax.response?.data?.error || 'Logo upload failed');
    },
    onSettled: () => setUploadingLogo(false),
  });

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingLogo(true);
      logoUploadMutation.mutate(file);
    }
    e.target.value = '';
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Company details
        </CardTitle>
        <CardDescription>
          Your company&apos;s identity. The name and logo appear on the public
          support portal; the full set feeds document templates (quotes, POs,
          invoices).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 mt-2">
        {/* Logo */}
        <div className="space-y-2">
          <Label>Company logo</Label>
          <div className="flex items-center gap-4">
            {form.logoUrl ? (
              <img
                src={form.logoUrl}
                alt="Company logo"
                className="h-14 w-auto max-w-[180px] rounded border bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-14 w-28 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
                No logo
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleFileSelected}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingLogo ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 h-4 w-4" />
                  )}
                  {form.logoUrl ? 'Replace' : 'Upload'}
                </Button>
                {form.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm({ ...form, logoUrl: '' })}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG, WebP or SVG · max 2MB</p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="co-name">Company name *</Label>
            <Input
              id="co-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={120}
              placeholder="Acme Sdn Bhd"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-reg">Registration no. (SSM)</Label>
            <Input
              id="co-reg"
              value={form.registrationNo}
              onChange={(e) => setForm({ ...form, registrationNo: e.target.value })}
              maxLength={80}
              placeholder="201901000001 (123456-A)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-tax">Tax ID</Label>
            <Input
              id="co-tax"
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              maxLength={80}
              placeholder="C1234567890"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-website">Website</Label>
            <Input
              id="co-website"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              maxLength={200}
              placeholder="https://www.acme.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-email">Email</Label>
            <Input
              id="co-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              maxLength={254}
              placeholder="info@acme.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-phone">Phone</Label>
            <Input
              id="co-phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              maxLength={40}
              placeholder="+60 3-1234 5678"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="co-address">Address</Label>
          <Textarea
            id="co-address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            maxLength={500}
            rows={5}
            placeholder={'Level 10, Menara Acme,\nJalan Bukit Bintang,\n55100 Kuala Lumpur'}
          />
          <p className="text-xs text-muted-foreground">Appears on document letterheads and footers.</p>
        </div>

        <div className="flex justify-end border-t pt-4">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save company details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
