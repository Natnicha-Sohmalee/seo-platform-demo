"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import styles from "./article-editor.module.css";

type Props = {
  documentId: string;
  markdown: string;
  onChange: (markdown: string) => void;
  readOnly: boolean;
  disabled: boolean;
};

export default function RichArticleEditor({ documentId, markdown, onChange, readOnly, disabled }: Props) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const extensions = useMemo(() => [
    StarterKit.configure({
      underline: false,
      link: { openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } },
    }),
    Markdown,
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ allowBase64: false, HTMLAttributes: { loading: "lazy", referrerpolicy: "no-referrer" } }),
  ], []);

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    content: markdown,
    contentType: "markdown",
    editable: !readOnly && !disabled,
    editorProps: { attributes: {
      class: styles.prose,
      "aria-label": "เนื้อหาบทความ",
      "aria-multiline": "true",
      role: "textbox",
      lang: "th",
    } },
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  }, [documentId]);

  const selection = useEditorState({
    editor,
    selector: ({ editor }) => editor ? {
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      bullet: editor.isActive("bulletList"),
      ordered: editor.isActive("orderedList"),
      quote: editor.isActive("blockquote"),
      link: editor.isActive("link"),
      heading: editor.isActive("heading") ? String(editor.getAttributes("heading").level) : "paragraph",
      undo: editor.can().undo(),
      redo: editor.can().redo(),
    } : null,
  });

  useEffect(() => {
    if (editor && editor.getMarkdown() !== markdown) {
      editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
    }
  }, [editor, markdown]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly && !disabled, false);
  }, [editor, readOnly, disabled]);

  function applyLink() {
    if (!editor) return;
    const href = link.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    let allowed = href.startsWith("/") && !href.startsWith("//");
    try { allowed ||= ["http:", "https:", "mailto:"].includes(new URL(href).protocol); } catch { /* ตรวจ relative URL ด้านบนแล้ว */ }
    if (!allowed) { setLinkError("ใช้ URL ที่ขึ้นต้นด้วย https://, http://, mailto: หรือ / สำหรับหน้าในเว็บไซต์"); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
    setLinkError("");
  }

  if (!editor) return <div className={styles.editorLoading} role="status">กำลังเตรียมหน้าเอกสาร…</div>;

  return <div className={styles.editor}>
    {!readOnly && <>
      <fieldset className={styles.toolbar} disabled={disabled} aria-label="เครื่องมือจัดรูปแบบบทความ">
        <select aria-label="รูปแบบข้อความ" className={styles.formatSelect} value={selection?.heading || "paragraph"} onChange={(event) => {
          if (event.target.value === "paragraph") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
        }}>
          <option value="paragraph">ข้อความปกติ</option>
          <option value="1">หัวข้อ H1</option><option value="2">หัวข้อ H2</option><option value="3">หัวข้อ H3</option>
          <option value="4">หัวข้อ H4</option><option value="5">หัวข้อ H5</option><option value="6">หัวข้อ H6</option>
        </select>
        <span className={styles.divider} aria-hidden="true" />
        <button className={styles.tool} type="button" title="ตัวหนา (Ctrl+B)" aria-label="ตัวหนา" aria-pressed={selection?.bold || false} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button className={styles.tool} type="button" title="ตัวเอียง (Ctrl+I)" aria-label="ตัวเอียง" aria-pressed={selection?.italic || false} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
        <span className={styles.divider} aria-hidden="true" />
        <button className={styles.tool} type="button" title="รายการหัวข้อ" aria-label="รายการหัวข้อ" aria-pressed={selection?.bullet || false} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()}>• ≡</button>
        <button className={styles.tool} type="button" title="รายการลำดับเลข" aria-label="รายการลำดับเลข" aria-pressed={selection?.ordered || false} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. ≡</button>
        <button className={styles.tool} type="button" title="ข้อความอ้างอิง" aria-label="ข้อความอ้างอิง" aria-pressed={selection?.quote || false} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❞</button>
        <button className={styles.tool} type="button" title="เพิ่มหรือแก้ลิงก์" aria-label="เพิ่มหรือแก้ลิงก์" aria-pressed={selection?.link || false} aria-expanded={linkOpen} onMouseDown={(event) => event.preventDefault()} onClick={() => {
          setLink(String(editor.getAttributes("link").href || ""));
          setLinkError("");
          setLinkOpen((value) => !value);
        }}>ลิงก์</button>
        <span className={styles.divider} aria-hidden="true" />
        <button className={styles.tool} type="button" title="ย้อนกลับ (Ctrl+Z)" aria-label="ย้อนกลับ" disabled={!selection?.undo} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().undo().run()}>↶</button>
        <button className={styles.tool} type="button" title="ทำซ้ำ" aria-label="ทำซ้ำ" disabled={!selection?.redo} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().redo().run()}>↷</button>
      </fieldset>
      {linkOpen && <form className={styles.linkForm} onSubmit={(event) => { event.preventDefault(); applyLink(); }}>
        <label className={styles.linkLabel}>ปลายทางลิงก์<input className={styles.input} value={link} disabled={disabled} onChange={(event) => setLink(event.target.value)} placeholder="https://example.com/page" /></label>
        <button className={styles.smallPrimary} type="submit" disabled={disabled}>ใช้ลิงก์</button>
        <button className={styles.textButton} type="button" onClick={() => setLinkOpen(false)}>ยกเลิก</button>
        {linkError && <p className={styles.linkError} role="alert">{linkError}</p>}
      </form>}
    </>}
    <EditorContent editor={editor} />
  </div>;
}
