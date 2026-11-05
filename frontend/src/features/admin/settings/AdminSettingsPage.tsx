import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  SlidersHorizontal,
  ListTodo,
  ClipboardCheck,
  ShieldCheck,
  Hash,
  Database,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TimesheetCategoriesTab,
  TimesheetRulesTab,
} from '@/features/admin/TimesheetSettingsPage';
import {
  ApprovalPoliciesTab,
  NumberingTab,
  ReferenceDataTab,
} from '@/features/admin/ProcurementSettingsPage';

/**
 * System settings.
 *
 * Timesheet and procurement settings used to be two separate pages that each
 * re-implemented a header and a tab bar around the same kind of content. They
 * are one page now: the tabs are grouped by the module they configure, and the
 * active tab is in the URL so a link can point at a specific panel.
 *
 * Nothing in this file fetches or mutates — each tab owns its own data, which
 * is what lets a user holding only `timesheet.settings.manage` land here
 * without the procurement tabs firing requests they will be refused.
 */

const TAB_KEYS = [
  'timesheet-categories',
  'timesheet-rules',
  'approval-policies',
  'numbering',
  'reference-data',
] as const;

type TabKey = (typeof TAB_KEYS)[number];

/** Which permission each tab needs. A tab is only rendered if you hold it. */
const TAB_PERMISSION: Record<TabKey, string> = {
  'timesheet-categories': 'timesheet.settings.manage',
  'timesheet-rules': 'timesheet.settings.manage',
  'approval-policies': 'procurement.settings.manage',
  numbering: 'procurement.settings.manage',
  'reference-data': 'procurement.settings.manage',
};

const DEFAULT_TAB: TabKey = 'timesheet-categories';

export function AdminSettingsPage() {
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab') as TabKey | null;

  const visibleTabs = TAB_KEYS.filter((key) => can(TAB_PERMISSION[key]));

  const resolve = (key: TabKey | null): TabKey => {
    if (key && TAB_KEYS.includes(key) && visibleTabs.includes(key)) return key;
    return visibleTabs[0] ?? DEFAULT_TAB;
  };

  const [tab, setTab] = useState<TabKey>(() => resolve(requested));

  // Keep the URL truthful when the tab changes, and re-resolve if the user
  // arrives with `?tab=` pointing somewhere they cannot see.
  useEffect(() => {
    const next = resolve(requested);
    if (next !== tab) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  const changeTab = (next: string) => {
    setTab(next as TabKey);
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  if (visibleTabs.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Settings"
          description="Manage system-wide configuration"
          icon={SlidersHorizontal}
        />
        <p className="text-sm text-muted-foreground">
          You don&apos;t hold a settings permission. Ask an administrator to grant
          you one in Access Control.
        </p>
      </div>
    );
  }

  const showTimesheet = visibleTabs.some((k) => k.startsWith('timesheet-'));
  const showProcurement = visibleTabs.some((k) => !k.startsWith('timesheet-'));

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title="Settings"
        description="Configure timesheet rules and procurement workflows"
        icon={SlidersHorizontal}
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          {showTimesheet && (
            <>
              <TabsTrigger value="timesheet-categories" className="gap-2">
                <ListTodo className="h-3.5 w-3.5" /> Timesheet Categories
              </TabsTrigger>
              <TabsTrigger value="timesheet-rules" className="gap-2">
                <ClipboardCheck className="h-3.5 w-3.5" /> Approval Rules
              </TabsTrigger>
            </>
          )}
          {showProcurement && (
            <>
              <TabsTrigger value="approval-policies" className="gap-2">
                <ShieldCheck className="h-3.5 w-3.5" /> Procurement Policies
              </TabsTrigger>
              <TabsTrigger value="numbering" className="gap-2">
                <Hash className="h-3.5 w-3.5" /> Numbering
              </TabsTrigger>
              <TabsTrigger value="reference-data" className="gap-2">
                <Database className="h-3.5 w-3.5" /> Reference Data
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {showTimesheet && (
          <>
            <TabsContent value="timesheet-categories" className="mt-4">
              <TimesheetCategoriesTab />
            </TabsContent>
            <TabsContent value="timesheet-rules" className="mt-4">
              <TimesheetRulesTab />
            </TabsContent>
          </>
        )}

        {showProcurement && (
          <>
            <TabsContent value="approval-policies" className="mt-4">
              <ApprovalPoliciesTab />
            </TabsContent>
            <TabsContent value="numbering" className="mt-4">
              <NumberingTab />
            </TabsContent>
            <TabsContent value="reference-data" className="mt-4">
              <ReferenceDataTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
