import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const sizeClasses: Record<string, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
};

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  children: React.ReactNode;
  /** Custom footer override (replaces default Cancel/Submit buttons) */
  footer?: React.ReactNode;
  /** Hide the footer entirely */
  hideFooter?: boolean;
  /** Additional class names for DialogContent */
  className?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  maxWidth = 'lg',
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  submitDisabled = false,
  children,
  footer,
  hideFooter = false,
  className,
}: FormDialogProps) {
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onOpenChange(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(sizeClasses[maxWidth], 'max-h-[90vh] overflow-y-auto p-6', className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">{children}</div>

          {!hideFooter && (
            footer !== undefined ? (
              footer
            ) : (
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  {cancelLabel}
                </Button>
                <Button type="submit" disabled={isSubmitting || submitDisabled}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {submitLabel}
                </Button>
              </DialogFooter>
            )
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
