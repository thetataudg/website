"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface EditorValue {
  html: string;
  text: string;
}

export interface RichTextEditorHandle {
  focusAtStart: () => void;
}

const EMAIL_FONTS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
] as const;

const TEXT_COLORS = ["#111827", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#9333ea"] as const;

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  strongDelimiter: "**",
});
turndown.use(gfm);

function markdownToHtml(markdown: string): string {
  const rendered = marked.parse(markdown, { async: false, breaks: true, gfm: true });
  if (typeof window === "undefined") return String(rendered);

  // Markdown allows raw HTML. Strip executable markup before it ever reaches
  // contentEditable; the API sanitizes it again before storage and sending.
  const doc = new DOMParser().parseFromString(String(rendered), "text/html");
  doc.querySelectorAll("li.task-list-item input[type=checkbox]").forEach((input) => {
    input.replaceWith(document.createTextNode((input as HTMLInputElement).checked ? "☑ " : "☐ "));
  });
  doc.querySelectorAll("script, style, iframe, object, embed, form, input, button, meta, link").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on") || name === "srcdoc") node.removeAttribute(attr.name);
      if ((name === "href" || name === "src") && /^(?:javascript|vbscript):/i.test(value)) node.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
}

function htmlToPlainText(html: string): string {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.innerText || doc.body.textContent || "").replace(/\u00a0/g, " ").trimEnd();
}

function selectedBlockPrefix(): { range: Range; prefix: string } | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  return { range, prefix: (node.textContent || "").slice(0, range.startOffset) };
}

export default function RichTextEditor({
  value,
  onChange,
  editorHandle,
}: {
  value: EditorValue;
  onChange: (next: EditorValue) => void;
  editorHandle?: React.MutableRefObject<RichTextEditorHandle | null>;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const initialHtml = useRef(value.html);
  const editorInitialized = useRef(false);
  const savedRange = useRef<Range | null>(null);
  const [mode, setMode] = useState<"rich" | "markdown">("rich");
  const [markdown, setMarkdown] = useState(() => turndown.turndown(value.html));
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [font, setFont] = useState<string>(EMAIL_FONTS[0].value);
  const [blockStyle, setBlockStyle] = useState("p");
  const [textSize, setTextSize] = useState("3");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [colorOpen, setColorOpen] = useState(false);
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const [customColor, setCustomColor] = useState("#6366f1");

  // contentEditable must remain uncontrolled after mount. React writing
  // innerHTML on every parent render either moves the caret to the start or
  // erases the character that was just typed. Seed it exactly once instead.
  const setEditorNode = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node;
    if (node && !editorInitialized.current) {
      node.innerHTML = initialHtml.current;
      editorInitialized.current = true;
    }
  }, []);

  const emitRichValue = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange({ html: editor.innerHTML, text: (editor.innerText || "").replace(/\u00a0/g, " ").trimEnd() });
  }, [onChange]);

  const rememberSelection = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection?.rangeCount || !editor) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !savedRange.current) return;
    selection.removeAllRanges();
    selection.addRange(savedRange.current);
  }, []);

  const refreshActive = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      strikeThrough: document.queryCommandState("strikeThrough"),
      insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      insertOrderedList: document.queryCommandState("insertOrderedList"),
      justifyLeft: document.queryCommandState("justifyLeft"),
      justifyCenter: document.queryCommandState("justifyCenter"),
      justifyRight: document.queryCommandState("justifyRight"),
      justifyFull: document.queryCommandState("justifyFull"),
    });
  }, []);

  useEffect(() => {
    const listener = () => {
      rememberSelection();
      refreshActive();
    };
    document.addEventListener("selectionchange", listener);
    return () => document.removeEventListener("selectionchange", listener);
  }, [refreshActive, rememberSelection]);

  useEffect(() => {
    if (!editorHandle) return;
    editorHandle.current = {
      focusAtStart: () => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      },
    };
    return () => {
      editorHandle.current = null;
    };
  }, [editorHandle]);

  const run = useCallback((command: string, argument?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, argument);
    rememberSelection();
    refreshActive();
    emitRichValue();
  }, [emitRichValue, refreshActive, rememberSelection, restoreSelection]);

  function switchMode(next: "rich" | "markdown") {
    if (next === mode) return;
    if (next === "markdown") {
      const html = editorRef.current?.innerHTML ?? value.html;
      setMarkdown(turndown.turndown(html));
    } else {
      const html = markdownToHtml(markdown);
      onChange({ html, text: htmlToPlainText(html) });
      requestAnimationFrame(() => {
        if (editorRef.current) editorRef.current.innerHTML = html;
      });
    }
    setMode(next);
  }

  function updateMarkdown(next: string) {
    setMarkdown(next);
    const html = markdownToHtml(next);
    onChange({ html, text: htmlToPlainText(html) });
  }

  function openLinkDialog() {
    rememberSelection();
    setLinkUrl("https://");
    setLinkOpen(true);
  }

  function addLink() {
    const raw = linkUrl.trim();
    if (!raw) return;
    const normalized = /^(?:https?:|mailto:|tel:)/i.test(raw) ? raw : `https://${raw}`;
    setLinkOpen(false);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      restoreSelection();
      const selection = window.getSelection();
      if (selection?.rangeCount && selection.isCollapsed) {
        const anchor = document.createElement("a");
        anchor.href = normalized;
        anchor.textContent = normalized;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        const range = selection.getRangeAt(0);
        range.insertNode(anchor);
        range.setStartAfter(anchor);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        document.execCommand("createLink", false, normalized);
      }
      rememberSelection();
      refreshActive();
      emitRichValue();
    });
  }

  function markdownShortcut(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey) return;
    const current = selectedBlockPrefix();
    if (!current) return;
    const command = ({
      "#": ["formatBlock", "h1"],
      "##": ["formatBlock", "h2"],
      "###": ["formatBlock", "h3"],
      ">": ["formatBlock", "blockquote"],
      "-": ["insertUnorderedList"],
      "*": ["insertUnorderedList"],
      "1.": ["insertOrderedList"],
      "```": ["formatBlock", "pre"],
    } as Record<string, string[]>)[current.prefix];
    if (!command) return;
    event.preventDefault();
    const marker = current.range.cloneRange();
    marker.setStart(current.range.startContainer, 0);
    marker.deleteContents();
    run(command[0], command[1]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b bg-muted/10 px-3 py-2" aria-label="Formatting toolbar">
        <div className="-m-1 flex items-center gap-2 overflow-x-auto p-1">
          <div className="flex shrink-0 rounded-md border bg-background p-0.5">
            <ModeButton active={mode === "rich"} onClick={() => switchMode("rich")}>Rich text</ModeButton>
            <ModeButton active={mode === "markdown"} onClick={() => switchMode("markdown")}>Markdown</ModeButton>
          </div>

          {mode === "rich" && (
            <>
              <Select value={font} onOpenChange={(open) => open && rememberSelection()} onValueChange={(next) => { setFont(next); run("fontName", next); }}>
                <SelectTrigger className="h-8 w-36 shrink-0 rounded-md text-xs focus:ring-1 focus:ring-offset-0" style={{ fontFamily: font }} aria-label="Font family" onMouseDown={rememberSelection}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_FONTS.map((item) => <SelectItem key={item.label} value={item.value} style={{ fontFamily: item.value }}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={blockStyle} onOpenChange={(open) => open && rememberSelection()} onValueChange={(next) => { setBlockStyle(next); run("formatBlock", next); }}>
                <SelectTrigger className="h-8 w-28 shrink-0 rounded-md text-xs focus:ring-1 focus:ring-offset-0" aria-label="Paragraph style" onMouseDown={rememberSelection}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="p">Paragraph</SelectItem>
                  <SelectItem value="h1">Heading 1</SelectItem>
                  <SelectItem value="h2">Heading 2</SelectItem>
                  <SelectItem value="h3">Heading 3</SelectItem>
                  <SelectItem value="pre">Code block</SelectItem>
                  <SelectItem value="blockquote">Quote</SelectItem>
                </SelectContent>
              </Select>
              <Select value={textSize} onOpenChange={(open) => open && rememberSelection()} onValueChange={(next) => { setTextSize(next); run("fontSize", next); }}>
                <SelectTrigger className="h-8 w-24 shrink-0 rounded-md text-xs focus:ring-1 focus:ring-offset-0" aria-label="Text size" onMouseDown={rememberSelection}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Small</SelectItem>
                  <SelectItem value="3">Medium</SelectItem>
                  <SelectItem value="4">Large</SelectItem>
                  <SelectItem value="5">Extra large</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {mode === "rich" && (
          <div className="-mx-1 mt-1 flex items-center gap-1 overflow-x-auto px-1 py-1">
            <ToolGroup>
            <ToolbarButton label="Bold" icon={Bold} active={active.bold} onClick={() => run("bold")} />
            <ToolbarButton label="Italic" icon={Italic} active={active.italic} onClick={() => run("italic")} />
            <ToolbarButton label="Underline" icon={Underline} active={active.underline} onClick={() => run("underline")} />
            <ToolbarButton label="Strikethrough" icon={Strikethrough} active={active.strikeThrough} onClick={() => run("strikeThrough")} />
            </ToolGroup>
            <ToolGroup>
            <ToolbarButton label="Bulleted list" icon={List} active={active.insertUnorderedList} onClick={() => run("insertUnorderedList")} />
            <ToolbarButton label="Numbered list" icon={ListOrdered} active={active.insertOrderedList} onClick={() => run("insertOrderedList")} />
            <ToolbarButton label="Quote" icon={Quote} onClick={() => run("formatBlock", "blockquote")} />
            <ToolbarButton label="Code block" icon={Code2} onClick={() => run("formatBlock", "pre")} />
            </ToolGroup>
            <ToolGroup>
            <ToolbarButton label="Align left" icon={AlignLeft} active={active.justifyLeft} onClick={() => run("justifyLeft")} />
            <ToolbarButton label="Align center" icon={AlignCenter} active={active.justifyCenter} onClick={() => run("justifyCenter")} />
            <ToolbarButton label="Align right" icon={AlignRight} active={active.justifyRight} onClick={() => run("justifyRight")} />
            <ToolbarButton label="Justify" icon={AlignJustify} active={active.justifyFull} onClick={() => run("justifyFull")} />
            </ToolGroup>
            <ToolGroup>
            <ToolbarButton label="Add link" icon={Link2} onClick={openLinkDialog} />
            <ToolbarButton label="Remove link" icon={Unlink} onClick={() => run("unlink")} />
            <Popover open={colorOpen} onOpenChange={(open) => { if (open) rememberSelection(); else setCustomColorOpen(false); setColorOpen(open); }}>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="size-8 rounded-sm" aria-label="Text color" title="Text color" onMouseDown={(event) => { event.preventDefault(); rememberSelection(); }}>
                  <span className="text-sm font-semibold underline decoration-2">A</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="start">
                <div className="grid grid-cols-4 gap-2" aria-label="Text colors">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="size-7 rounded-sm border shadow-sm outline-none ring-offset-background hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      style={{ backgroundColor: color }}
                      aria-label={`Use text color ${color}`}
                      onClick={() => { setColorOpen(false); run("foreColor", color); }}
                    />
                  ))}
                  <button
                    type="button"
                    className="flex size-7 items-center justify-center rounded-sm border bg-muted text-foreground shadow-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Choose a custom text color"
                    title="Custom color"
                    onClick={() => setCustomColorOpen((open) => !open)}
                  >
                    <Palette className="size-4" />
                  </button>
                </div>
                {customColorOpen && (
                  <form
                    className="mt-2 flex gap-2 border-t pt-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!/^#[0-9a-f]{6}$/i.test(customColor)) return;
                      setColorOpen(false);
                      setCustomColorOpen(false);
                      run("foreColor", customColor);
                    }}
                  >
                    <Input
                      value={customColor}
                      onChange={(event) => setCustomColor(event.target.value)}
                      className="h-8 min-w-0 font-mono text-xs"
                      maxLength={7}
                      aria-label="Custom hex color"
                      placeholder="#6366f1"
                    />
                    <Button type="submit" size="sm" className="h-8" disabled={!/^#[0-9a-f]{6}$/i.test(customColor)}>Apply</Button>
                  </form>
                )}
              </PopoverContent>
            </Popover>
            <ToolbarButton label="Clear formatting" icon={RemoveFormatting} onClick={() => run("removeFormat")} />
            </ToolGroup>
            <ToolGroup>
            <ToolbarButton label="Undo" icon={Undo2} onClick={() => run("undo")} />
            <ToolbarButton label="Redo" icon={Redo2} onClick={() => run("redo")} />
            </ToolGroup>
          </div>
        )}
      </div>

      <div
          ref={setEditorNode}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          dir="ltr"
          role="textbox"
          aria-label="Message"
          aria-multiline="true"
          data-placeholder="Write a message…"
          className={cn("mail-rich-editor min-h-0 flex-1 overflow-y-auto px-5 py-4 text-left text-sm leading-relaxed text-foreground outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-blue-400 [&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6", mode !== "rich" && "hidden")}
          style={{ direction: "ltr", fontFamily: EMAIL_FONTS[0].value }}
          onInput={emitRichValue}
          onKeyDown={(event) => {
            markdownShortcut(event);
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
              event.preventDefault();
              rememberSelection();
              openLinkDialog();
            }
          }}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onBlur={emitRichValue}
      />
      <textarea
          value={markdown}
          onChange={(event) => updateMarkdown(event.target.value)}
          dir="ltr"
          className={cn("min-h-0 flex-1 resize-none bg-transparent px-5 py-4 text-left font-mono text-sm leading-relaxed text-foreground outline-none", mode !== "markdown" && "hidden")}
          aria-label="Message in Markdown"
          placeholder="Write Markdown…"
          spellCheck
      />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={(event) => event.preventDefault()}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addLink();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a link</DialogTitle>
              <DialogDescription>Enter the web address for the selected text.</DialogDescription>
            </DialogHeader>
            <Input
              className="mt-4"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://example.com"
              aria-label="Link URL"
              autoFocus
            />
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!linkUrl.trim()}>Add link</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn("rounded-sm px-2.5 py-1 text-xs text-muted-foreground transition-colors", active && "bg-accent font-medium text-accent-foreground shadow-sm")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Bold;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-8 rounded-sm", active && "bg-accent text-accent-foreground")}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </Button>
  );
}

function ToolGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 rounded-md border bg-background p-0.5">{children}</div>;
}
