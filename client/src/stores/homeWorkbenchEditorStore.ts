// @ts-nocheck
import { create } from 'zustand';

export const useHomeWorkbenchEditorStore = create((set) => ({
  editorContent: '',
  setEditorContent: (editorContent: string | ((p: string) => string)) =>
    set((s: { editorContent: string }) => ({
      editorContent: typeof editorContent === 'function' ? (editorContent as (p: string) => string)(s.editorContent) : editorContent,
    })),
}));
