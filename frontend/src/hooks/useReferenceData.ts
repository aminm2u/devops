import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';

interface ReferenceDataItem {
  id: number;
  group: string;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  metadata?: any;
}

/**
 * Fetch reference data items for a specific group.
 * Use this instead of hardcoded dropdown arrays.
 *
 * @example
 * const { data: budgetTypes } = useReferenceData('budget_type');
 * const { data: divisions } = useReferenceData('division');
 */
export function useReferenceData(group: string) {
  return useQuery<ReferenceDataItem[]>({
    queryKey: ['reference-data', group],
    queryFn: () =>
      apiClient.get(`/settings/reference-data/${group}`).then((r) => r.data.data),
    staleTime: 5 * 60 * 1000, // 5 minutes - reference data doesn't change often
  });
}

/**
 * Fetch all reference data groups at once.
 */
export function useAllReferenceData() {
  return useQuery<Record<string, ReferenceDataItem[]>>({
    queryKey: ['reference-data'],
    queryFn: () =>
      apiClient.get('/settings/reference-data').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Helper to convert reference data items to select options.
 */
export function toSelectOptions(items: ReferenceDataItem[] | undefined) {
  if (!items) return [];
  return items.map((item) => ({
    value: item.value,
    label: item.label,
  }));
}
