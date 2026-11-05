import { ExternalLink, Layers, Plus, X } from 'lucide-react';
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
import { formatDate, formatStatus } from '@/lib/utils';

/**
 * Environments.
 *
 * These are the deployment targets a release names — which is also why the
 * deployments elsewhere on this page ask for one: production needs a sign-off,
 * staging does not.
 */
export function EnvironmentsTab({
  project,
  canEdit,
  onAdd,
  onRemove,
}: {
  project: any;
  canEdit: boolean;
  onAdd: () => void;
  onRemove: (envId: number, name: string) => void;
}) {
  const environments = project.environments ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Environments</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Environment
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {environments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Layers className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No environments configured</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Created</TableHead>
                {canEdit && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {environments.map((env: any) => (
                <TableRow key={env.id}>
                  <TableCell className="font-medium">{env.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatStatus(env.type)}</Badge>
                  </TableCell>
                  <TableCell>
                    {env.url ? (
                      <a
                        href={env.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        {env.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(env.createdAt)}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onRemove(env.id, env.name)}
                        aria-label="Remove environment"
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
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
