import * as React from 'react';
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ColorPickerProps {
  /** Hex color, e.g. '#3b82f6' or '#3b82f680' when alpha. Defaults to '#000000'. */
  value?: string;
  onChange: (value: string) => void;
  /** Enable alpha channel via HexAlphaColorPicker (default: false). */
  alpha?: boolean;
  /** Optional preset swatches (hex strings) displayed as quick-pick buttons. */
  presets?: string[];
  disabled?: boolean;
  className?: string;
}

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Controlled color picker component with visual saturation palette, hex text input,
 * and optional preset swatches.
 * Use for tag/label colors, chart series, project branding, and theming inputs.
 */
export function ColorPicker({
  value = '#000000',
  onChange,
  alpha = false,
  presets,
  disabled = false,
  className,
}: ColorPickerProps) {
  const [inputValue, setInputValue] = React.useState(value);

  // Sync external value to local text input
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    const normalized = val.startsWith('#') ? val : `#${val}`;
    if (HEX_REGEX.test(normalized)) {
      onChange(normalized);
    }
  };

  const handleInputBlur = () => {
    const normalized = inputValue.startsWith('#') ? inputValue : `#${inputValue}`;
    if (HEX_REGEX.test(normalized)) {
      setInputValue(normalized);
      onChange(normalized);
    } else {
      // Revert to valid value
      setInputValue(value);
    }
  };

  const PickerComponent = alpha ? HexAlphaColorPicker : HexColorPicker;

  return (
    <div
      className={cn(
        'w-full max-w-[220px] space-y-3',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <div className="overflow-hidden rounded-lg border border-border shadow-sm [&_.react-colorful]:w-full [&_.react-colorful]:h-[160px]">
        <PickerComponent color={value} onChange={onChange} />
      </div>

      <div className="flex items-center gap-2">
        <div
          className="h-8 w-8 shrink-0 rounded-md border border-border shadow-inner"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder="#000000"
          disabled={disabled}
          className="h-8 font-mono text-xs uppercase"
          maxLength={alpha ? 9 : 7}
        />
      </div>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {presets.map((preset) => {
            const isSelected = value.toLowerCase() === preset.toLowerCase();
            return (
              <button
                key={preset}
                type="button"
                disabled={disabled}
                onClick={() => onChange(preset)}
                className={cn(
                  'h-6 w-6 rounded-full border border-border/60 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected && 'ring-2 ring-primary ring-offset-2'
                )}
                style={{ backgroundColor: preset }}
                title={preset}
              >
                <span className="sr-only">{preset}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
