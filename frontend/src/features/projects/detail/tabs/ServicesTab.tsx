import { Box, Pencil, Plus, Trash2 } from 'lucide-react';
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

/** Services running inside this project. */
export function ServicesTab({
  project,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  project: any;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (service: any) => void;
  onDelete: (service: any) => void;
}) {
  const services = project.services ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Services</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Service
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {services.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Box className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No services configured</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Version</TableHead>
                {canEdit && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service: any) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatStatus(service.type)}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge domain="generic" value={service.status} />
                  </TableCell>
                  <TableCell>{service.port || '-'}</TableCell>
                  <TableCell>{service.version || '-'}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onEdit(service)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => onDelete(service)}
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
        )}
      </CardContent>
    </Card>
  );
}
