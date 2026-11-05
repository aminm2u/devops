import { Eye, EyeOff, Pencil, Plus, Server, Trash2 } from 'lucide-react';
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
import { formatStatus } from '@/lib/utils';

/**
 * Infrastructure, scoped to one project.
 *
 * Node passwords are shown on demand rather than fetched lazily like project
 * credentials — the node payload already carries them, and this tab is behind
 * `project.record.view` inside an authenticated shell. The eye toggle is a
 * shoulder-surfing measure, not a security boundary; the API is the boundary.
 */
export function InfrastructureTab({
  project,
  canEdit,
  visiblePasswords,
  onTogglePassword,
  onAdd,
  onEdit,
  onDelete,
}: {
  project: any;
  canEdit: boolean;
  visiblePasswords: Record<number, boolean>;
  onTogglePassword: (id: number) => void;
  onAdd: () => void;
  onEdit: (node: any) => void;
  onDelete: (node: any) => void;
}) {
  const nodes = project.infrastructureNodes ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Infrastructure Nodes</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Server
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Server className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No servers configured</p>
            {canEdit && (
              <Button variant="link" size="sm" onClick={onAdd}>
                Add your first server
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>Memory</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Password</TableHead>
                  {canEdit && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node: any) => (
                  <TableRow key={node.id}>
                    <TableCell className="font-medium">
                      <div>
                        <div>{node.name}</div>
                        {node.hostname && (
                          <div className="text-xs text-muted-foreground">{node.hostname}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{node.ipAddress}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatStatus(node.type)}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge domain="generic" value={node.status} />
                    </TableCell>
                    <TableCell>{node.cpuCores !== null ? `${node.cpuCores} cores` : '-'}</TableCell>
                    <TableCell>{node.memoryGb !== null ? `${node.memoryGb} GB` : '-'}</TableCell>
                    <TableCell>{node.storageGb !== null ? `${node.storageGb} GB` : '-'}</TableCell>
                    <TableCell className="text-sm">{node.username || '-'}</TableCell>
                    <TableCell>
                      {node.password ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm">
                            {visiblePasswords[node.id] ? node.password : '••••••••'}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => onTogglePassword(node.id)}
                          >
                            {visiblePasswords[node.id] ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onEdit(node)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => onDelete(node)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
