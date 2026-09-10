import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  RefreshCw,
  Maximize2,
  Minimize2,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Settings,
  Plus,
  Trash2,
  Check,
  ArrowLeft,
  Folder,
  Clock,
  Search,
  LayoutGrid,
  List,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import apiClient from '@/api/client';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { AxiosRequestConfig } from 'axios';

// ── Types ────────────────────────────────────────────────────────────────────
interface GrafanaDashboard {
  id: number;
  uid: string;
  title: string;
  folderTitle: string;
  folderUid: string;
  tags: string[];
  type: string;
  url: string;
  slug: string;
  updatedAt: string;
  version: number;
}

interface GrafanaConfig {
  url: string;
  frontendUrl: string;
  hasApiKey: boolean;
  dashboards: { uid: string; name: string }[];
  isConfigured: boolean;
}

// Axios config extension for suppressing global error toasts
interface SuppressToastConfig extends AxiosRequestConfig {
  suppressErrorToast?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};

const buildEmbedUrl = (dash: GrafanaDashboard, frontendUrl: string, iframeKey: number): string => {
  if (!frontendUrl) return '';
  const base = frontendUrl.replace(/\/$/, '');
  return `${base}/d/${dash.uid}?orgId=1&kiosk&_t=${iframeKey}`;
};

// ── Component ────────────────────────────────────────────────────────────────
export function GrafanaPage() {
  const queryClient = useQueryClient();

  // UI state
  const [selectedDashboard, setSelectedDashboard] = useState<GrafanaDashboard | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  // Settings form state
  const [formUrl, setFormUrl] = useState('');
  const [formFrontendUrl, setFormFrontendUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formDashboards, setFormDashboards] = useState<{ uid: string; name: string }[]>([]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: hiddenUids = [] } = useQuery({
    queryKey: ['grafana-hidden'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/grafana_hidden_dashboards');
      const val = res.data?.data;
      return Array.isArray(val) ? val : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['grafana-config'],
    queryFn: async () => {
      const res = await apiClient.get('/grafana/config');
      return res.data?.data as GrafanaConfig;
    },
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: dashboards = [],
    isLoading: dashboardsLoading,
    error: dashboardsError,
    refetch: refetchDashboards,
  } = useQuery({
    queryKey: ['grafana-dashboards'],
    queryFn: async () => {
      const res = await apiClient.get('/grafana/dashboards', {
        suppressErrorToast: true,
      } as SuppressToastConfig);
      return (res.data?.data || []) as GrafanaDashboard[];
    },
    enabled: !!config?.isConfigured,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: (data: { url: string; frontendUrl: string; apiKey: string; dashboards: { uid: string; name: string }[] }) =>
      apiClient.put('/grafana/config', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grafana-config'] });
      queryClient.invalidateQueries({ queryKey: ['grafana-dashboards'] });
      setShowSettings(false);
      toast.success('Grafana configuration saved');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Failed to save configuration'),
  });

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (showSettings && config) {
      setFormUrl(config.url || '');
      setFormFrontendUrl(config.frontendUrl || 'http://localhost:3000');
      setFormApiKey('');
      setFormDashboards(config.dashboards?.length ? [...config.dashboards] : []);
    }
  }, [showSettings, config]);

  // ── Memoized data ───────────────────────────────────────────────────────
  const hiddenSet = useMemo(() => new Set(hiddenUids), [hiddenUids]);

  const fallbackDashboards = useMemo(() =>
    (config?.dashboards || []).map((d) => ({
      id: 0,
      uid: d.uid,
      title: d.name,
      folderTitle: 'Favorites',
      folderUid: '',
      tags: [],
      type: 'dash-db',
      url: '',
      slug: d.uid,
      updatedAt: new Date().toISOString(),
      version: 1,
    })),
    [config?.dashboards]
  );

  const apiAvailable = !dashboardsError && dashboards.length > 0;
  const allDashboards = apiAvailable ? dashboards : fallbackDashboards;
  const displayDashboards = useMemo(
    () => allDashboards.filter((d) => !hiddenSet.has(d.uid)),
    [allDashboards, hiddenSet]
  );

  const folders = useMemo(
    () => [...new Set(displayDashboards.map((d) => d.folderTitle))].sort(),
    [displayDashboards]
  );

  const filteredDashboards = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return displayDashboards.filter((d) => {
      const matchesSearch =
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q));
      const matchesFolder = folderFilter === 'all' || d.folderTitle === folderFilter;
      return matchesSearch && matchesFolder;
    });
  }, [displayDashboards, searchQuery, folderFilter]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setIframeKey((k) => k + 1);
    refetchDashboards();
  }, [refetchDashboards]);

  const toggleFullscreen = useCallback(() => setIsFullscreen((f) => !f), []);

  const addDashboard = useCallback(() => {
    setFormDashboards((prev) => [...prev, { uid: '', name: '' }]);
  }, []);

  const removeDashboard = useCallback((index: number) => {
    setFormDashboards((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateDashboard = useCallback((index: number, field: 'uid' | 'name', value: string) => {
    setFormDashboards((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const handleSaveSettings = useCallback(() => {
    if (!formUrl.trim()) {
      toast.error('Grafana URL is required');
      return;
    }
    try {
      new URL(formUrl);
    } catch {
      toast.error('Please enter a valid URL (e.g., http://localhost:3000)');
      return;
    }
    // Validate frontendUrl if provided
    if (formFrontendUrl.trim()) {
      try {
        new URL(formFrontendUrl);
      } catch {
        toast.error('Please enter a valid Frontend URL (e.g., http://localhost:3000)');
        return;
      }
    }
    const validDashboards = formDashboards.filter((d) => d.uid.trim());
    saveMutation.mutate({
      url: formUrl.trim(),
      frontendUrl: formFrontendUrl.trim() || 'http://localhost:3000',
      apiKey: formApiKey.trim(),
      dashboards: validDashboards,
    });
  }, [formUrl, formFrontendUrl, formApiKey, formDashboards, saveMutation]);

  const handleDeleteDashboard = useCallback(async (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isFavorite = config?.dashboards?.some((d) => d.uid === uid);

    setDeletingUid(uid);
    try {
      if (isFavorite && config) {
        const updated = config.dashboards.filter((d) => d.uid !== uid);
        await apiClient.put('/grafana/config', {
          url: config.url,
          dashboards: updated,
        });
        queryClient.invalidateQueries({ queryKey: ['grafana-config'] });
        toast.success('Dashboard removed from favorites');
      } else {
        const updated = [...hiddenUids, uid];
        await apiClient.put('/settings/grafana_hidden_dashboards', {
          key: 'grafana_hidden_dashboards',
          value: updated,
          group: 'grafana',
        });
        queryClient.invalidateQueries({ queryKey: ['grafana-hidden'] });
        toast.success('Dashboard hidden');
      }
    } catch {
      toast.error('Failed to remove dashboard');
    } finally {
      setDeletingUid(null);
    }
  }, [config, hiddenUids, queryClient]);

  const handleRestoreAll = useCallback(async () => {
    try {
      await apiClient.put('/settings/grafana_hidden_dashboards', {
        key: 'grafana_hidden_dashboards',
        value: [],
        group: 'grafana',
      });
      queryClient.invalidateQueries({ queryKey: ['grafana-hidden'] });
      toast.success('All dashboards restored');
    } catch {
      toast.error('Failed to restore dashboards');
    }
  }, [queryClient]);

  const openInGrafana = useCallback((uid: string) => {
    const grafanaUrl = config?.frontendUrl || config?.url;
    if (grafanaUrl) {
      window.open(`${grafanaUrl.replace(/\/$/, '')}/d/${uid}?orgId=1`, '_blank');
    }
  }, [config?.frontendUrl, config?.url]);

  // ── Settings Panel ──────────────────────────────────────────────────────
  if (showSettings) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Grafana Settings</h1>
            <p className="text-muted-foreground">Configure your Grafana connection</p>
          </div>
          <Button variant="outline" onClick={() => setShowSettings(false)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>Enter your Grafana instance details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="grafana-url">Grafana URL *</Label>
              <Input
                id="grafana-url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="http://host.docker.internal:3000"
              />
              <p className="text-xs text-muted-foreground">
                Internal URL for API access (use host.docker.internal:3000 for Docker)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grafana-frontend-url">Frontend URL</Label>
              <Input
                id="grafana-frontend-url"
                value={formFrontendUrl}
                onChange={(e) => setFormFrontendUrl(e.target.value)}
                placeholder="http://localhost:3000"
              />
              <p className="text-xs text-muted-foreground">
                Browser-accessible URL for embeds (use localhost:3000 for local access)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grafana-api-key">API Key</Label>
              <Input
                id="grafana-api-key"
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder={config?.hasApiKey ? '•••••••• (already set, leave blank to keep)' : 'Optional'}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for anonymous access
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Favorite Dashboards</CardTitle>
                <CardDescription>Pinned dashboards shown in the quick selector</CardDescription>
              </div>
              <Button size="sm" onClick={addDashboard}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {formDashboards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No favorite dashboards. The full list is fetched automatically from Grafana.
              </p>
            ) : (
              formDashboards.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Input
                    value={d.uid}
                    onChange={(e) => updateDashboard(i, 'uid', e.target.value)}
                    placeholder="Dashboard UID"
                    className="flex-1"
                  />
                  <Input
                    value={d.name}
                    onChange={(e) => updateDashboard(i, 'name', e.target.value)}
                    placeholder="Display Name"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
                    onClick={() => removeDashboard(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowSettings(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveSettings} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Save Configuration
          </Button>
        </div>
      </div>
    );
  }

  // ── Not Configured State ────────────────────────────────────────────────
  if (!configLoading && config && !config.isConfigured) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Grafana Dashboards</h1>
            <p className="text-muted-foreground">External monitoring dashboards</p>
          </div>
          <Button onClick={() => setShowSettings(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Configure Grafana
          </Button>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Grafana Not Configured</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Connect your Grafana instance to display monitoring dashboards directly within the platform.
            </p>
            <Button onClick={() => setShowSettings(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Configure Grafana
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Dashboard Viewer (when a dashboard is selected) ─────────────────────
  if (selectedDashboard) {
    const embedUrl = buildEmbedUrl(selectedDashboard, config?.frontendUrl || config?.url || '', iframeKey);

    return (
      <div className={cn(
        'flex flex-col animate-fade-in',
        isFullscreen
          ? 'fixed inset-0 z-50 bg-background p-4'
          : 'h-[calc(100vh-64px)]'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedDashboard(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{selectedDashboard.title}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Folder className="h-3.5 w-3.5" />
                {selectedDashboard.folderTitle}
                {selectedDashboard.tags.length > 0 && (
                  <>
                    <span>·</span>
                    {selectedDashboard.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={toggleFullscreen}>
              {isFullscreen ? (
                <Minimize2 className="mr-2 h-4 w-4" />
              ) : (
                <Maximize2 className="mr-2 h-4 w-4" />
              )}
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
            {config?.url && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`${config.url.replace(/\/$/, '')}/d/${selectedDashboard.uid}?orgId=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Grafana
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Iframe */}
        {embedUrl ? (
          <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
            <CardContent className="p-0 flex-1 min-h-0">
              <iframe
                key={iframeKey}
                src={embedUrl}
                title={selectedDashboard.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── Dashboard Grid (main view) ──────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Grafana Dashboards</h1>
          <p className="text-muted-foreground">
            {dashboardsLoading
              ? 'Loading dashboards...'
              : `${filteredDashboards.length} dashboard${filteredDashboards.length !== 1 ? 's' : ''} ${apiAvailable ? 'from Grafana' : '(favorites)'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hiddenUids.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleRestoreAll}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore ({hiddenUids.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={dashboardsLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', dashboardsLoading && 'animate-spin')} />
            Refresh
          </Button>
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* API Error Banner */}
      {dashboardsError && config?.hasApiKey === false && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Grafana API requires authentication</p>
              <p className="text-xs text-muted-foreground">
                Add a Grafana API key in Settings to fetch all dashboards automatically. Showing favorite dashboards for now.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="mr-2 h-3.5 w-3.5" />
              Add API Key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search dashboards by name or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        {folders.length > 1 && (
          <Select value={folderFilter} onValueChange={setFolderFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Folders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Folders</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Loading */}
      {dashboardsLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error — only show when there are NO fallback dashboards either */}
      {dashboardsError && !dashboardsLoading && fallbackDashboards.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
            <h3 className="text-lg font-semibold mb-2">Failed to Load Dashboards</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Could not connect to the Grafana API. Please check your configuration and ensure the Grafana instance is reachable.
            </p>
            <Button variant="outline" onClick={() => setShowSettings(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Check Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!dashboardsLoading && !dashboardsError && displayDashboards.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
            <h3 className="text-lg font-semibold mb-2">No Dashboards Found</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Your Grafana instance has no dashboards, or the API key doesn't have permission to read them.
            </p>
            <Button variant="outline" onClick={() => setShowSettings(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Check Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* No search results */}
      {!dashboardsLoading && filteredDashboards.length === 0 && displayDashboards.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No dashboards match your search</p>
          </CardContent>
        </Card>
      )}

      {/* Grid View */}
      {!dashboardsLoading && viewMode === 'grid' && filteredDashboards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDashboards.map((dash) => (
            <Card
              key={dash.uid}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
              onClick={() => setSelectedDashboard(dash)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={deletingUid === dash.uid}
                      onClick={(e) => handleDeleteDashboard(dash.uid, e)}
                      title="Remove from favorites"
                    >
                      {deletingUid === dash.uid ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        openInGrafana(dash.uid);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-semibold text-sm mb-1 line-clamp-2">{dash.title}</h3>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                  <Folder className="h-3 w-3" />
                  {dash.folderTitle}
                </div>
                {dash.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {dash.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                    {dash.tags.length > 3 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        +{dash.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                {formatDate(dash.updatedAt) && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(dash.updatedAt)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* List View */}
      {!dashboardsLoading && viewMode === 'list' && filteredDashboards.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredDashboards.map((dash) => (
                <div
                  key={dash.uid}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedDashboard(dash)}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm truncate">{dash.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Folder className="h-3 w-3" />
                          {dash.folderTitle}
                        </span>
                        {formatDate(dash.updatedAt) && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(dash.updatedAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {dash.tags.length > 0 && (
                      <div className="flex gap-1">
                        {dash.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={deletingUid === dash.uid}
                      onClick={(e) => handleDeleteDashboard(dash.uid, e)}
                      title="Remove from favorites"
                    >
                      {deletingUid === dash.uid ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        openInGrafana(dash.uid);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
