import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Upload, X, Link, Clipboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file?: File; // For actual upload
  url?: string; // For uploaded file URL
  isUploaded?: boolean;
}

interface Document {
  id: number;
  projectId: number;
  title: string;
  content?: string | null;
  type: string;
  status: string;
  version: string;
  metadata?: any;
}

interface DocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  document?: Document | null;
  onSuccess?: () => void;
}

const emptyForm = {
  title: '',
  content: '',
  type: 'other',
  status: 'draft',
  version: '1.0',
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('pdf')) return '📄';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('sheet') || type.includes('excel')) return '📊';
  if (type.includes('presentation') || type.includes('powerpoint')) return '📽️';
  if (type.includes('text') || type.includes('json') || type.includes('xml')) return '📃';
  if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return '📦';
  return '📎';
}

export function DocumentDialog({
  open,
  onOpenChange,
  projectId,
  document: doc,
  onSuccess,
}: DocumentDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [isPending, setIsPending] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (doc) {
      setForm({
        title: doc.title || '',
        content: doc.content || '',
        type: doc.type || 'other',
        status: doc.status || 'draft',
        version: doc.version || '1.0',
      });
      // Load existing files from metadata
      if (doc.metadata?.files) {
        setUploadingFiles(doc.metadata.files.map((f: any) => ({
          id: f.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: f.originalName || f.name,
          size: f.size || 0,
          type: f.mimeType || f.type || 'application/octet-stream',
          url: f.url,
          isUploaded: true,
        })));
      } else {
        setUploadingFiles([]);
      }
    } else {
      setForm(emptyForm);
      setUploadingFiles([]);
    }
    setUrlInput('');
    setPasteContent('');
  }, [doc, open]);

  const addFilesToQueue = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    let addedCount = 0;

    setUploadingFiles(prev => {
      const newFiles: UploadedFile[] = [];
      for (const file of fileArray) {
        if (prev.some(f => f.name === file.name)) {
          toast.error(`File "${file.name}" already added`);
          continue;
        }
        newFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          file,
          isUploaded: false,
        });
      }
      addedCount = newFiles.length;
      return [...prev, ...newFiles];
    });

    if (addedCount > 0) {
      toast.success(`${addedCount} file(s) added to queue`);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      addFilesToQueue(files);
    }
  }, [addFilesToQueue]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFilesToQueue(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addFilesToQueue]);

  const addUrl = () => {
    if (!urlInput.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      new URL(urlInput);
    } catch {
      toast.error('Invalid URL format');
      return;
    }

    const fileName = urlInput.split('/').pop()?.split('?')[0] || 'linked-document';
    setUploadingFiles(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: fileName,
      size: 0,
      type: 'link',
      url: urlInput.trim(),
      isUploaded: true,
    }]);

    setUrlInput('');
    toast.success('Link added');
  };

  const addPasteContent = () => {
    if (!pasteContent.trim()) {
      toast.error('Please paste some content');
      return;
    }

    const blob = new Blob([pasteContent], { type: 'text/plain' });
    const file = new File([blob], `pasted-content-${new Date().toISOString().slice(0, 10)}.txt`, {
      type: 'text/plain',
    });

    addFilesToQueue([file]);
    setPasteContent('');
  };

  const removeFile = (id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadFiles = async (): Promise<any[]> => {
    const filesToUpload = uploadingFiles.filter(f => f.file && !f.isUploaded);

    if (filesToUpload.length === 0) {
      return uploadingFiles.filter(f => f.isUploaded).map(f => ({
        id: f.id,
        originalName: f.name,
        fileName: f.name,
        mimeType: f.type,
        size: f.size,
        url: f.url || '',
      }));
    }

    const formData = new FormData();
    formData.append('projectId', projectId.toString());

    for (const uf of filesToUpload) {
      if (uf.file) {
        formData.append('files', uf.file);
      }
    }

    try {
      const response = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploaded = response.data.data;

      // Update state with uploaded file URLs
      setUploadingFiles(prev =>
        prev.map(f => {
          if (f.file && !f.isUploaded) {
            const uploadedFile = uploaded.find((u: any) => u.originalName === f.name);
            if (uploadedFile) {
              return { ...f, url: uploadedFile.url, isUploaded: true };
            }
          }
          return f;
        })
      );

      // Return all files (previously uploaded + newly uploaded)
      return [
        ...uploadingFiles.filter(f => f.isUploaded).map(f => ({
          id: f.id,
          originalName: f.name,
          fileName: f.name,
          mimeType: f.type,
          size: f.size,
          url: f.url || '',
        })),
        ...uploaded,
      ];
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload files');
      throw err;
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }

    setIsPending(true);
    try {
      // Upload files first
      const files = await uploadFiles();

      const payload: any = {
        projectId,
        title: form.title.trim(),
        content: form.content.trim() || null,
        type: form.type,
        status: form.status,
        version: form.version.trim() || '1.0',
        files: files.length > 0 ? files : undefined,
        metadata: files.length > 0 ? { files } : undefined,
      };

      if (doc) {
        await apiClient.put(`/documents/${doc.id}`, payload);
        toast.success('Document updated');
      } else {
        await apiClient.post('/documents', payload);
        toast.success('Document created');
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      if (err.message !== 'Failed to upload files') {
        toast.error(err.response?.data?.message || 'Failed to save document');
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <Card className='pt-8 border-0 shadow-none'>
          <CardHeader>
            <CardTitle>{doc ? 'Edit Document' : 'Upload Document'}</CardTitle>
            <CardDescription>
              {doc ? 'Update document details' : 'Add documents from files, links, or paste content'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., API Documentation"
            />
          </div>

          {/* Type, Status, Version */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="documentation">Documentation</SelectItem>
                  <SelectItem value="runbook">Runbook</SelectItem>
                  <SelectItem value="architecture">Architecture</SelectItem>
                  <SelectItem value="api">API Spec</SelectItem>
                  <SelectItem value="meeting_notes">Meeting Notes</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="1.0"
              />
            </div>
          </div>

          {/* Upload Section */}
          <div className="space-y-2">
            <Label>Attachments</Label>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="upload" className="flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  File Upload
                </TabsTrigger>
                <TabsTrigger value="url" className="flex items-center gap-1.5">
                  <Link className="h-3.5 w-3.5" />
                  From URL
                </TabsTrigger>
                <TabsTrigger value="paste" className="flex items-center gap-1.5">
                  <Clipboard className="h-3.5 w-3.5" />
                  Paste Content
                </TabsTrigger>
              </TabsList>

              {/* File Upload Tab */}
              <TabsContent value="upload">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                    transition-colors duration-200
                    ${isDragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                    }
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="*/*"
                  />
                  <Upload className={`h-10 w-10 mx-auto mb-3 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-sm font-medium mb-1">
                    {isDragOver ? 'Drop files here' : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supports all file types • Multiple files allowed • Max 50MB per file
                  </p>
                </div>
              </TabsContent>

              {/* URL Tab */}
              <TabsContent value="url">
                <div className="flex gap-2">
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/document.pdf"
                    onKeyDown={(e) => e.key === 'Enter' && addUrl()}
                  />
                  <Button type="button" variant="secondary" onClick={addUrl}>
                    Add Link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Add links to external documents, wikis, or resources
                </p>
              </TabsContent>

              {/* Paste Content Tab */}
              <TabsContent value="paste">
                <Textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste your content here (text, code, JSON, etc.)..."
                  rows={6}
                  className="font-mono text-sm"
                />
                <Button type="button" variant="secondary" onClick={addPasteContent} className="mt-2">
                  Add Content
                </Button>
              </TabsContent>
            </Tabs>
          </div>

          {/* Uploaded Files List */}
          {uploadingFiles.length > 0 && (
            <div className="space-y-2">
              <Label>Attached Files ({uploadingFiles.length})</Label>
              <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                {uploadingFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 p-3 hover:bg-muted/50">
                    <span className="text-xl">{getFileIcon(file.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.url ? 'Uploaded' : file.size > 0 ? formatFileSize(file.size) : 'Pending upload'}
                      </p>
                    </div>
                    {file.url && (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700">✓ Uploaded</Badge>
                    )}
                    {!file.url && !file.isUploaded && (
                      <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700">Queued</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Additional notes about this document..."
              rows={4}
              className="text-sm"
            />
          </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {doc ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
