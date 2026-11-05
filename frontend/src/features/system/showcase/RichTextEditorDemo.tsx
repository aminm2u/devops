import * as React from 'react';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

/**
 * Self-contained rich text editor demonstration chunk for the component showcase page.
 * Code-split via React.lazy so Tiptap libraries only load when viewing this section.
 */
export function RichTextEditorDemo() {
  const [content, setContent] = React.useState<string>(
    '<h2>Procurement Specification</h2><p>Please supply <strong>10x server rack units</strong> with dual redundant power supplies.</p><ul><li>Rack mount rails included</li><li>Delivery to Data Center A by end of month</li></ul>'
  );

  return (
    <div className="space-y-4">
      <RichTextEditor
        value={content}
        onChange={setContent}
        placeholder="Type project description or requirements here..."
        minHeight={140}
      />

      {content && (
        <div className="space-y-1.5 pt-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Output HTML ({content.length} chars)
          </span>
          <pre className="max-h-[100px] overflow-auto rounded-md bg-muted/60 p-2.5 font-mono text-[11px] text-muted-foreground border border-border/50">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
