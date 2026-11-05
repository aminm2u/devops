import { AlertTriangle, Pencil, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';

/**
 * Incidents raised against this project.
 *
 * There is no delete action: `incident.routes.ts` exposes no DELETE, so the
 * old page's trash button was a guaranteed 404. Incidents are closed by
 * changing status instead, which is also the record audit actually wants.
 */
export function IncidentsTab({
  project,
  canCreate,
  canEdit,
  onAdd,
  onEdit,
}: {
  project: any;
  canCreate: boolean;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (incident: any) => void;
}) {
  const incidents = project.incidents ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Incidents</CardTitle>
        {canCreate && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Report Incident
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No incidents reported</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                {canEdit && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.map((incident: any) => (
                <TableRow key={incident.id}>
                  <TableCell className="font-medium">{incident.title}</TableCell>
                  <TableCell>
                    {incident.team ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {incident.team.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge domain="helpdeskPriority" value={incident.severity} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge domain="helpdeskStatus" value={incident.status} />
                  </TableCell>
                  <TableCell>{formatDate(incident.createdAt)}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onEdit(incident)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
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
  );
}
