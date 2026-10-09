import * as React from 'react';
import SignaturePadNative from 'signature_pad';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SignaturePadHandle {
  /** Clear all strokes from the canvas. */
  clear: () => void;
  /** Undo the most recent stroke. */
  undo: () => void;
  /** Returns true if no strokes have been drawn. */
  isEmpty: () => boolean;
  /** Export the signature as a data URL (PNG format by default). */
  toDataURL: (type?: string) => string;
}

export interface SignaturePadProps {
  /**
   * Called with the data URL (PNG) whenever a stroke finishes, an undo occurs, or the pad is cleared.
   * Emits an empty string when the pad is cleared.
   */
  onChange?: (dataUrl: string) => void;
  /** Stroke color. Defaults to '#0f172a' (deep ink). */
  penColor?: string;
  /** Stroke width in pixels. Defaults to 2. */
  penWidth?: number;
  /** Canvas height in pixels. Defaults to 160. */
  height?: number;
  /** Show built-in Clear and Undo buttons below the canvas. Defaults to true. */
  showActions?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Draw-to-sign signature pad built on signature_pad v5 with device-pixel-ratio scaling,
 * stroke-end change events, and stroke-level undo/clear operations.
 * Use for procurement approvals, receipt acknowledgments, and requisition authorizations.
 */
export const SignaturePad = React.forwardRef<SignaturePadHandle, SignaturePadProps>(
  (
    {
      onChange,
      penColor = '#0f172a',
      penWidth = 2,
      height = 160,
      showActions = true,
      disabled = false,
      className,
    },
    ref
  ) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const padRef = React.useRef<SignaturePadNative | null>(null);

    // Keep onChange in a stable ref so parent re-renders never tear down the canvas instance
    const onChangeRef = React.useRef(onChange);
    React.useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    const emitChange = React.useCallback(() => {
      if (!onChangeRef.current || !padRef.current) return;
      if (padRef.current.isEmpty()) {
        onChangeRef.current('');
      } else {
        onChangeRef.current(padRef.current.toDataURL('image/png'));
      }
    }, []);

    const resizeCanvas = React.useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const pad = padRef.current;
      if (!canvas || !container || !pad) return;

      const rect = container.getBoundingClientRect();
      if (!rect.width) return;

      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();

      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
      }

      pad.clear();
      if (data && data.length > 0) {
        pad.fromData(data);
      }
    }, [height]);

    // Initialize signature pad on mount
    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const pad = new SignaturePadNative(canvas, {
        penColor,
        minWidth: Math.max(0.5, penWidth - 0.5),
        maxWidth: penWidth + 0.5,
      });
      padRef.current = pad;

      const handleEndStroke = () => {
        emitChange();
      };

      pad.addEventListener('endStroke', handleEndStroke);

      resizeCanvas();

      return () => {
        pad.removeEventListener('endStroke', handleEndStroke);
        pad.off();
        padRef.current = null;
      };
    }, [penColor, penWidth, emitChange, resizeCanvas]);

    // Watch container size changes with ResizeObserver (catches modal transitions & window resize)
    React.useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const observer = new ResizeObserver(() => {
        resizeCanvas();
      });
      observer.observe(container);

      return () => {
        observer.disconnect();
      };
    }, [resizeCanvas]);

    // Handle disabled state
    React.useEffect(() => {
      if (!padRef.current) return;
      if (disabled) {
        padRef.current.off();
      } else {
        padRef.current.on();
      }
    }, [disabled]);

    const handleClear = React.useCallback(() => {
      if (!padRef.current) return;
      padRef.current.clear();
      emitChange();
    }, [emitChange]);

    const handleUndo = React.useCallback(() => {
      if (!padRef.current) return;
      const data = padRef.current.toData();
      if (data.length > 0) {
        data.pop();
        padRef.current.fromData(data);
        emitChange();
      }
    }, [emitChange]);

    // Expose imperative handle via ref
    React.useImperativeHandle(
      ref,
      () => ({
        clear: handleClear,
        undo: handleUndo,
        isEmpty: () => padRef.current?.isEmpty() ?? true,
        toDataURL: (type = 'image/png') =>
          padRef.current?.toDataURL(type) ?? '',
      }),
      [handleClear, handleUndo]
    );

    return (
      <div
        ref={containerRef}
        className={cn(
          'w-full space-y-2',
          disabled && 'pointer-events-none opacity-50',
          className
        )}
      >
        <div className="relative overflow-hidden rounded-lg border border-border/80 bg-white p-1 shadow-sm">
          <canvas
            ref={canvasRef}
            className="block w-full touch-none cursor-crosshair bg-white rounded-md"
            style={{ height: `${height}px` }}
          />

          {/* Watermark sign line */}
          <div
            className="pointer-events-none absolute inset-x-4 bottom-5 flex items-center justify-between border-b border-dashed border-zinc-300 text-[10px] text-zinc-400 select-none pb-0.5"
            aria-hidden="true"
          >
            <span>Sign here</span>
            <span>✕</span>
          </div>
        </div>

        {showActions && (
          <div className="flex items-center justify-between pt-0.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={handleUndo}
              className="h-8 gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Undo</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={handleClear}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear</span>
            </Button>
          </div>
        )}
      </div>
    );
  }
);
SignaturePad.displayName = 'SignaturePad';
