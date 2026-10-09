import * as React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface RichTextEditorProps {
  /** Bound HTML string. '' when the editor has no text. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Minimum height of the editable text area in pixels. Defaults to 120. */
  minHeight?: number;
  disabled?: boolean;
  className?: string;
}

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-7 w-7 p-0 text-muted-foreground hover:text-foreground',
        active && 'bg-accent text-accent-foreground font-semibold'
      )}
      title={title}
    >
      {children}
    </Button>
  );
}

/**
 * WYSIWYG rich text editor powered by Tiptap v3.
 * Supports bold, italic, underline, strikethrough, H2/H3 headings, bullet and numbered lists,
 * hyperlinking, and undo/redo history.
 *
 * NOTE: Output is an HTML string. When rendering this output elsewhere in the application,
 * always sanitize the content (e.g. via DOMPurify) before inserting into the DOM.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something...',
  minHeight = 120,
  disabled = false,
  className,
}: RichTextEditorProps) {
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = React.useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
        link: {
          openOnClick: false,
          autolink: true,
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || '',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      const isBlank = ed.isEmpty;
      onChange(isBlank ? '' : ed.getHTML());
    },
  });

  // Sync external value changes into the editor instance
  React.useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (value !== currentHtml && (value || !editor.isEmpty)) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [editor, value]);

  // Sync disabled state
  React.useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  const openLinkPopover = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setLinkPopoverOpen(true);
  };

  const handleApplyLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    if (linkUrl.trim() === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      const url = linkUrl.startsWith('http://') || linkUrl.startsWith('https://') || linkUrl.startsWith('mailto:')
        ? linkUrl
        : `https://${linkUrl}`;
      editor.chain().focus().setLink({ href: url }).run();
    }
    setLinkPopoverOpen(false);
  };

  const handleRemoveLink = () => {
    if (!editor) return;
    editor.chain().focus().unsetLink().run();
    setLinkPopoverOpen(false);
  };

  if (!editor) {
    return (
      <div
        className={cn(
          'w-full rounded-md border border-input bg-background animate-pulse',
          className
        )}
        style={{ minHeight: `${minHeight + 40}px` }}
      />
    );
  }

  return (
    <div
      className={cn(
        'rich-text-editor w-full rounded-md border border-input bg-background shadow-sm transition-colors',
        'focus-within:ring-1 focus-within:ring-ring focus-within:border-ring',
        disabled && 'pointer-events-none opacity-60 bg-muted/30',
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/70 p-1 bg-muted/20">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Link Popover */}
        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openLinkPopover}
              className={cn(
                'h-7 w-7 p-0 text-muted-foreground hover:text-foreground',
                editor.isActive('link') && 'bg-accent text-accent-foreground font-semibold'
              )}
              title="Hyperlink"
            >
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-2 space-y-2 z-50" align="start">
            <form onSubmit={handleApplyLink} className="space-y-2">
              <span className="text-xs font-medium text-foreground">Insert link</span>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                className="h-8 text-xs"
                autoFocus
              />
              <div className="flex items-center justify-between pt-1">
                {editor.isActive('link') ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveLink}
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
                  >
                    <Unlink className="h-3 w-3" />
                    Remove
                  </Button>
                ) : <span />}
                <Button type="submit" size="sm" className="h-7 px-3 text-xs">
                  Apply
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>

          <ToolbarButton
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="px-3 py-2 text-sm" style={{ minHeight: `${minHeight}px` }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
