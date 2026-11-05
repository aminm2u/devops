import { useState } from 'react';
import { ExternalLink, Eye, FileText, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FormDialog } from '@/components/ui/form-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatStatus } from '@/lib/utils';

/**
 * Documents.
 *
 * The viewer lives here rather than in the page because it is opened from a
 * row and shows nothing the page needs to know about — keeping it local means
 * switching tabs cannot leave a half-open dialog behind.
 */
export function DocumentsTab({
  project,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  project: any;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (doc: any) => void;
  onDelete: (doc: any) => void;
}) {
  const [viewing, setViewing] = useState<any>(null);
  const documents = project.documents ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Documents</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FolderOpen className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No documents uploaded</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Created</TableHead>
                {canEdit && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc: any) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <button
                      className="text-left font-medium text-primary hover:underline"
                      onClick={() => setViewing(doc)}
                    >
                      {doc.title}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatStatus(doc.type)}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge domain="generic" value={doc.status} />
                  </TableCell>
                  <TableCell>{doc.version}</TableCell>
                  <TableCell>{formatDate(doc.createdAt)}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setViewing(doc)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onEdit(doc)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => onDelete(doc)}
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

      <FormDialog
        open={!!viewing}
        onOpenChange={() => setViewing(null)}
        title={viewing?.title || 'Document'}
        maxWidth="lg"
        hideFooter
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Type:</span>
              <Badge variant="outline">{formatStatus(viewing?.type || '')}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <StatusBadge domain="generic" value={viewing?.status || ''} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Version:</span>
              <span>{viewing?.version}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Created:</span>
              <span>{formatDate(viewing?.createdAt)}</span>
            </div>
          </div>

          <Separator />

          {viewing?.content && (
            <div>
              <h4 className="mb-2 font-medium">Content</h4>
              <div className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm">
                {viewing.content}
              </div>
            </div>
          )}

          {viewing?.metadata?.files && viewing.metadata.files.length > 0 && (
            <div>
              <h4 className="mb-2 font-medium">Attached Files</h4>
              <div className="space-y-2">
                {viewing.metadata.files.map(
                  (
                    file: { url: string; originalName: string; mimeType: string; size: number },
                    index: number
                  ) => (
                    <div
                      key={`${file.url}-${index}`}
                      className="flex items-center justify-between rounded-lg bg-muted p-3"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{file.originalName}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.mimeType} • {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => openFile(file.url)}>
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </Button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {viewing?.contentUrl && (
            <div>
              <h4 className="mb-2 font-medium">Link</h4>
              <a
                href={viewing.contentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {viewing.contentUrl}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </FormDialog>
    </Card>
  );
}

/**
 * Opens an uploaded file.
 *
 * The old code appended `?token=` to the URL, which put the bearer token in the
 * browser history, the referrer header and the server's access log — a session
 * leak for the sake of a convenience. Uploads are served from the same origin
 * by nginx, so a plain link is enough; if a file ever needs an authenticated
 * fetch, it should be a short-lived signed URL instead.
 */
function openFile(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
