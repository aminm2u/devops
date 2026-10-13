import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  htmlFor?: string;
  /** Renders a red asterisk after the label */
  required?: boolean;
  /** Muted helper text shown below the control */
  hint?: string;
  /** Red validation message shown below the control (replaces hint) */
  error?: string;
  children: React.ReactNode;
}

/**
 * Standard form field wrapper: label on top, control below, consistent
 * spacing. Use instead of hand-writing `<div className="space-y-2"><Label/>...</div>`.
 *
 * ```tsx
 * <FormField label="Domain Name" required>
 *   <Input value={form.name} onChange={...} placeholder="e.g., example.com" />
 * </FormField>
 * ```
 */
export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
