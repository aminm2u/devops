import { Copy, Eye, EyeOff, Key, Pencil, Plus, Trash2 } from 'lucide-react';
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

/**
 * Credentials.
 *
 * Passwords are stored encrypted and are *not* in the project payload, so the
 * reveal path fetches one secret at a time and caches it for the session. That
 * is deliberate: a list request must never return every password at once.
 */
export function CredentialsTab({
  project,
  canEdit,
  visiblePasswords,
  decryptedPasswords,
  onTogglePassword,
  onCopy,
  onAdd,
  onEdit,
  onDelete,
}: {
  project: any;
  canEdit: boolean;
  visiblePasswords: Record<number, boolean>;
  decryptedPasswords: Record<number, string>;
  onTogglePassword: (credId: number) => void;
  onCopy: (text: string) => void;
  onAdd: () => void;
  onEdit: (cred: any) => void;
  onDelete: (cred: any) => void;
}) {
  const credentials = project.credentials ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Key className="h-4 w-4" />
          Credentials
        </CardTitle>
        {canEdit && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Credential
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Key className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No credentials stored</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add server, database, or API credentials for easy access
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Description</TableHead>
                  {canEdit && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {credentials.map((cred: any) => (
                  <TableRow key={cred.id}>
                    <TableCell className="font-medium">{cred.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{cred.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{cred.host}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-1 h-6 w-6"
                        onClick={() => onCopy(cred.host)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      {cred.username ? (
                        <>
                          <span className="font-mono text-sm">{cred.username}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-1 h-6 w-6"
                            onClick={() => onCopy(cred.username)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {visiblePasswords[cred.id]
                          ? decryptedPasswords[cred.id] || '••••••••'
                          : '••••••••'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-1 h-6 w-6"
                        onClick={() => onTogglePassword(cred.id)}
                      >
                        {visiblePasswords[cred.id] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-1 h-6 w-6"
                        onClick={() => onCopy(decryptedPasswords[cred.id] ?? '')}
                        disabled={!decryptedPasswords[cred.id]}
                        title={
                          decryptedPasswords[cred.id]
                            ? 'Copy password'
                            : 'Reveal the password first'
                        }
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </TableCell>
                    <TableCell className="max-w-32 truncate text-muted-foreground">
                      {cred.description || '-'}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onEdit(cred)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onDelete(cred)}
                            aria-label="Delete credential"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
