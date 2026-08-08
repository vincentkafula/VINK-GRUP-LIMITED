import { useRef, useEffect, useCallback } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Quote, Link2, Heading2, Heading3 } from "lucide-react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/**
 * A real but intentionally lightweight rich text editor built on
 * contentEditable + document.execCommand, rather than pulling in a new
 * dependency (tiptap/quill/slate) whose compatibility with this exact
 * React/Vite setup hasn't been verified in this environment. execCommand
 * is old and technically deprecated, but still broadly supported and a
 * common, pragmatic choice for exactly this scope of editing (bold,
 * italic, headings, lists, quotes, links) without the bundle size or
 * integration risk of a full editor framework.
 */
export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (ref.current && (isFirstRender.current || document.activeElement !== ref.current)) {
      ref.current.innerHTML = value || "";
      isFirstRender.current = false;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML);
  }, [onChange]);

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    ref.current?.focus();
    handleInput();
  };

  const handleLink = () => {
    const url = window.prompt("Link URL:");
    if (url) exec("createLink", url);
  };

  const buttons: { icon: React.ReactNode; command: string; arg?: string; title: string }[] = [
    { icon: <Bold className="w-3.5 h-3.5" />, command: "bold", title: "Bold" },
    { icon: <Italic className="w-3.5 h-3.5" />, command: "italic", title: "Italic" },
    { icon: <Underline className="w-3.5 h-3.5" />, command: "underline", title: "Underline" },
    { icon: <Heading2 className="w-3.5 h-3.5" />, command: "formatBlock", arg: "H2", title: "Heading" },
    { icon: <Heading3 className="w-3.5 h-3.5" />, command: "formatBlock", arg: "H3", title: "Subheading" },
    { icon: <List className="w-3.5 h-3.5" />, command: "insertUnorderedList", title: "Bullet list" },
    { icon: <ListOrdered className="w-3.5 h-3.5" />, command: "insertOrderedList", title: "Numbered list" },
    { icon: <Quote className="w-3.5 h-3.5" />, command: "formatBlock", arg: "BLOCKQUOTE", title: "Quote" },
  ];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50 flex-wrap">
        {buttons.map(b => (
          <button key={b.title} type="button" title={b.title} onMouseDown={e => e.preventDefault()} onClick={() => exec(b.command, b.arg)}
            className="p-1.5 rounded-md hover:bg-gray-200 text-gray-600">
            {b.icon}
          </button>
        ))}
        <button type="button" title="Link" onMouseDown={e => e.preventDefault()} onClick={handleLink} className="p-1.5 rounded-md hover:bg-gray-200 text-gray-600">
          <Link2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={handleInput}
        data-placeholder={placeholder}
        className="rich-text-editable px-3.5 py-3 text-sm outline-none min-h-[220px] max-h-[420px] overflow-y-auto"
        suppressContentEditableWarning
      />
      <style>{`
        .rich-text-editable:empty:before { content: attr(data-placeholder); color: #9CA3AF; }
        .rich-text-editable h2 { font-size: 1.25rem; font-weight: 700; margin: 0.75rem 0 0.4rem; }
        .rich-text-editable h3 { font-size: 1.05rem; font-weight: 700; margin: 0.6rem 0 0.3rem; }
        .rich-text-editable blockquote { border-left: 3px solid #128A43; padding-left: 0.75rem; margin: 0.5rem 0; color: #4B5563; font-style: italic; }
        .rich-text-editable ul, .rich-text-editable ol { padding-left: 1.5rem; margin: 0.4rem 0; }
        .rich-text-editable a { color: #128A43; text-decoration: underline; }
        .rich-text-editable p { margin: 0.4rem 0; }
      `}</style>
    </div>
  );
}
