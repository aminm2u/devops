import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { MessageSquare, Paperclip, Send, Timer, X } from 'lucide-react';

export type ComposerMode = 'message' | 'log';

export interface ComposerTarget {
  /** null = the task itself */
  subtaskId: number | null;
  /** Human label for the target chip ("Task" or the subtask title) */
  label: string;
}

interface ChatComposerProps {
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  /** Where a message / work log will land. Always shown in log mode. */
  target: ComposerTarget;
  /** Clear the target back to the task itself (log mode chip ✕). */
  onClearTarget?: () => void;
  /** Available targets for the log-mode picker — the task plus its subtasks. */
  targets: ComposerTarget[];
  onTargetChange?: (subtaskId: number | null) => void;

  messageDraft: string;
  onMessageDraftChange: (value: string) => void;
  logHours: string;
  onLogHoursChange: (value: string) => void;
  logDraft: string;
  onLogDraftChange: (value: string) => void;
  /** Files picked for the pending message (message mode only). */
  files: File[];
  onPickFiles: (picked: FileList | null) => void;
  onRemoveFile: (index: number) => void;
  maxFiles: number;
  maxFileMb: number;
  acceptedLabel: string;

  onSubmit: () => void;
  isSubmitting: boolean;
  /** Live connection indicator, rendered next to the header of the pane. */
  hint?: string;
  className?: string;
}

/**
 * The task's single composer.
 *
 * Message and log-work are two modes of one form rather than two boxes. The
 * old page had a chat textarea in the discussion and a separate "Log work"
 * card in the sidebar, both bound to the same `comment` state — typing in one
 * wrote into the other. Here each mode owns its own draft, and the mode (plus
 * the target chip) is what decides where a submit goes.
 */
export function ChatComposer({
  mode,
  onModeChange,
  target,
  onClearTarget,
  targets,
  onTargetChange,
  messageDraft,
  onMessageDraftChange,
  logHours,
  onLogHoursChange,
  logDraft,
  onLogDraftChange,
  files,
  onPickFiles,
  onRemoveFile,
  maxFiles,
  maxFileMb,
  acceptedLabel,
  onSubmit,
  isSubmitting,
  hint,
  className,
}: ChatComposerProps) {
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isLog = mode === 'log';
  const hours = Number.parseFloat(logHours || '0');
  const canSubmit = isLog
    ? logDraft.trim().length > 0 && hours > 0 && hours <= 24
    : messageDraft.trim().length > 0;

  return (
    <div className={cn('border-t border-border/60 bg-card px-4 py-3', className)}>
      {/* Mode switch — one composer, two jobs */}
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onModeChange('message')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            !isLog ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60'
          )}
        >
          <MessageSquare className="h-3 w-3" />
          Message
        </button>
        <button
          type="button"
          onClick={() => onModeChange('log')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            isLog ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60'
          )}
        >
          <Timer className="h-3 w-3" />
          Log hours
        </button>
        {hint && (
          <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span>
        )}
      </div>

      {isLog ? (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] text-muted-foreground">Target</span>
              {/* The shared Select, not a native one — same look and keyboard
                  behaviour as every other picker. Full width so a long subtask
                  title has room instead of being squeezed a word per line. */}
              <Select
                value={target.subtaskId === null ? 'task' : String(target.subtaskId)}
                onValueChange={(v) => onTargetChange?.(v === 'task' ? null : Number(v))}
              >
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.subtaskId ?? 'task'} value={String(t.subtaskId ?? 'task')}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Hint and reset get their own line, so neither competes with the
                picker for horizontal room. */}
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[10px] text-muted-foreground">
                Logged to your timesheet
              </span>
              {target.subtaskId !== null && onClearTarget && (
                <button
                  type="button"
                  onClick={onClearTarget}
                  className="shrink-0 whitespace-nowrap text-[10px] font-medium text-primary hover:underline"
                  title="Log against the task itself instead"
                >
                  Reset to task
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-20 shrink-0">
              <Label className="text-[11px] text-muted-foreground">Hrs</Label>
              <Input
                type="number"
                min="0"
                max="24"
                step="0.25"
                value={logHours}
                onChange={(e) => onLogHoursChange(e.target.value)}
                placeholder="0.0"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex-1">
              <Label className="text-[11px] text-muted-foreground">Work done</Label>
              <Textarea
                ref={logRef}
                value={logDraft}
                onChange={(e) => onLogDraftChange(e.target.value)}
                placeholder="What did you work on?"
                rows={2}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Ctrl/⌘ + Enter to log</span>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              onClick={onSubmit}
              disabled={!canSubmit || isSubmitting}
            >
              <Send className="h-3.5 w-3.5" />
              {hours > 0 ? `Log ${hours}h` : 'Log Work'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 py-1 pl-2.5 pr-1 text-xs"
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {Math.max(1, Math.round(file.size / 1024))} KB
                  </span>
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-black/10"
                    onClick={() => onRemoveFile(index)}
                    title={`Remove ${file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted/60"
              title={`Attach files — up to ${maxFiles} × ${maxFileMb}MB. ${acceptedLabel}.`}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                onPickFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Textarea
              ref={messageRef}
              value={messageDraft}
              onChange={(e) => onMessageDraftChange(e.target.value)}
              placeholder={target.subtaskId === null ? 'Message the team…' : 'Reply on this subtask…'}
              rows={2}
              className="flex-1 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />
            <Button
              size="sm"
              className="h-9"
              onClick={onSubmit}
              disabled={!canSubmit || isSubmitting}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Posting to <span className="font-medium text-foreground">{target.label}</span>
            {target.subtaskId !== null && onClearTarget && (
              <button
                type="button"
                onClick={onClearTarget}
                className="ml-1.5 text-primary hover:underline"
              >
                post to task instead
              </button>
            )}
            {' · '}
            {acceptedLabel}, up to {maxFiles} files, {maxFileMb}MB each. Hours go in Log hours.
          </p>
        </div>
      )}
    </div>
  );
}
