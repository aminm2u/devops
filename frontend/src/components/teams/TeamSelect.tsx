import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { teamsApi, type MyTeam } from '@/api/teams';
import { cn } from '@/lib/utils';

/**
 * Team selection, in the two shapes the DevOps pages need.
 *
 * `TeamFilter` narrows an existing list to one team; `TeamPicker` chooses the
 * team a new record is filed under. Both read `/teams/mine`, because a person
 * may only file — or meaningfully filter — by teams they belong to. What they
 * can *see* is still decided by the server's scope rules, not by this list.
 */

export function useMyTeams() {
  return useQuery({
    queryKey: ['teams', 'mine'],
    queryFn: teamsApi.mine,
    staleTime: 5 * 60 * 1000,
  });
}

interface TeamFilterProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Label for the "no filter" option. Defaults to "All Teams". */
  allLabel?: string;
  disabled?: boolean;
}

export function TeamFilter({ value, onChange, className, allLabel = 'All Teams' }: TeamFilterProps) {
  const { data: teams = [], isLoading } = useMyTeams();

  // Without membership there is nothing to narrow by — hide rather than show
  // a filter that can only ever say "all".
  if (!isLoading && teams.length === 0) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('w-full sm:w-[170px]', className)}>
        <SelectValue placeholder="Team" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {teams.map((team) => (
          <SelectItem key={team.id} value={String(team.id)}>
            {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface TeamPickerProps {
  value: number | null;
  onChange: (teamId: number | null) => void;
  label?: string;
  /** Shown under the field when the person belongs to several teams. */
  hint?: string;
  className?: string;
}

/**
 * Files a record under a team.
 *
 * When someone belongs to exactly one team the choice is not a choice, so the
 * field states the fact instead of asking a question the server would answer
 * the same way anyway.
 */
export function TeamPicker({ value, onChange, label = 'Team', hint, className }: TeamPickerProps) {
  const { data: teams = [], isLoading } = useMyTeams();

  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        <Label>{label}</Label>
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <Label>{label}</Label>
        <p className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          You are not a member of any team, so this record will be filed as unassigned.
        </p>
      </div>
    );
  }

  if (teams.length === 1) {
    const only = teams[0] as MyTeam;
    return (
      <div className={cn('space-y-2', className)}>
        <Label>{label}</Label>
        <p className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
          {only.name}
          {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label>{label}</Label>
      <Select
        value={value == null ? 'none' : String(value)}
        onValueChange={(v) => onChange(v === 'none' ? null : Number(v))}
      >
        <SelectTrigger>
          <SelectValue placeholder="Choose a team" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {teams.map((team) => (
            <SelectItem key={team.id} value={String(team.id)}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
