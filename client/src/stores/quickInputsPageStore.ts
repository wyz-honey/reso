// @ts-nocheck
import { create } from 'zustand';

const emptyForm = { label: '', content: '', sort_order: '' };

function upd<T>(prev: T, next: T | ((p: T) => T)): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

export const useQuickInputsPageStore = create((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  loading: true,
  setLoading: (loading) => set({ loading }),
  error: '',
  setError: (error) => set({ error }),
  msg: '',
  setMsg: (msg) => set({ msg }),
  form: { ...emptyForm },
  setForm: (u) => set((s) => ({ form: upd(s.form, u) })),
  editingId: null,
  setEditingId: (editingId) => set({ editingId }),
  busy: false,
  setBusy: (busy) => set({ busy }),
  formModalOpen: false,
  setFormModalOpen: (formModalOpen) => set({ formModalOpen }),
  searchInput: '',
  setSearchInput: (searchInput) => set({ searchInput }),
  searchQ: '',
  setSearchQ: (searchQ) => set({ searchQ }),
}));

export { emptyForm };
