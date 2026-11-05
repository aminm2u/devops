import { Pencil, Plus, Rocket, Trash2 } from 'lucide-react';
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
 * Deployments on this project.
 *
 * A `pending` row is one waiting on its team lead — this is the project-side
 * view of the same record the DevOps Operations page and the Approval inbox
 * show. Nothing here decides approval; the server does.
 */
export function DeploymentsTab({
  project,
  canCreate,
  canEdit,
  canDelete,
  onAdd,
  onEdit,
  onDelete,
}: {
  project: any;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onAdd: () => void;
  onEdit: (deployment: any) => void;
  onDelete: (deployment: any) => void;
}) {
  const deployments = project.deployments ?? [];
  const showActions = canEdit || canDelete;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Deployments</CardTitle>
        {canCreate && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            New Deployment
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {deployments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Rocket className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No deployments yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Deployed At</TableHead>
                {showActions && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment: any) => (
                <TableRow key={deployment.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {deployment.name}
                      {deployment.team && (
                        <Badge variant="secondary" className="text-[10px]">
                          {deployment.team.name}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>v{deployment.version}</TableCell>
                  <TableCell>
                    <StatusBadge domain="generic" value={deployment.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {deployment.branch || deployment.commitHash?.slice(0, 7) || '-'}
                  </TableCell>
                  <TableCell>
                    {deployment.deployedAt ? formatDate(deployment.deployedAt) : '-'}
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onEdit(deployment)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => onDelete(deployment)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
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
