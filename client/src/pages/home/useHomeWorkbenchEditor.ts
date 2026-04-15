// @ts-nocheck — aligned with HomePage incremental typing
import { useCallback, useEffect, useRef, useState } from 'react';

export function useHomeWorkbenchEditor() {
  const [editorContent, setEditorContent] = useState('');
  const editorTextareaRef = useRef(null);
  const editorSelRef = useRef({ start: null, end: null });
  const editorContentRef = useRef('');

  useEffect(() => {
    editorContentRef.current = editorContent;
  }, [editorContent]);

  const captureEditorSelection = useCallback(() => {
    const ta = editorTextareaRef.current;
    if (ta && typeof ta.selectionStart === 'number') {
      editorSelRef.current = {
        start: ta.selectionStart,
        end: ta.selectionEnd ?? ta.selectionStart,
      };
    }
  }, []);

  const onEditorBlur = useCallback(() => {
    captureEditorSelection();
  }, [captureEditorSelection]);

  const insertQuickContent = useCallback((text) => {
    const raw = String(text ?? '');
    if (!raw) return;
    setEditorContent((prev) => {
      const ta = editorTextareaRef.current;
      let start;
      let end;
      if (ta && document.activeElement === ta) {
        start = Math.min(ta.selectionStart, prev.length);
        end = Math.min(ta.selectionEnd ?? start, prev.length);
      } else {
        const saved = editorSelRef.current;
        if (saved.start != null && saved.end != null) {
          start = Math.min(saved.start, prev.length);
          end = Math.min(saved.end, prev.length);
        } else {
          start = end = prev.length;
        }
      }
      const before = prev.slice(0, start);
      const after = prev.slice(end);
      let piece = raw;
      if (before.length > 0 && !/\n$/.test(before) && !/^\n/.test(piece)) {
        piece = `\n${piece}`;
      }
      const next = before + piece + after;
      const caret = (before + piece).length;
      queueMicrotask(() => {
        const el = editorTextareaRef.current;
        if (el) {
          el.focus();
          try {
            el.setSelectionRange(caret, caret);
          } catch {
            /* ignore */
          }
          editorSelRef.current = { start: caret, end: caret };
        }
      });
      return next;
    });
  }, []);

  return {
    editorContent,
    setEditorContent,
    editorContentRef,
    editorTextareaRef,
    editorSelRef,
    captureEditorSelection,
    onEditorBlur,
    insertQuickContent,
  };
}
