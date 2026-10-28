import { create } from 'zustand';
import type { Task } from '@shared/schema';

export type QuickAddKind = 'task' | 'assignment' | 'event' | 'habit' | 'note' | 'reminder';

export type ModalState =
  | { kind: 'task'; id?: string; defaults?: Partial<Task> }
  | { kind: 'quickadd'; tab?: QuickAddKind; defaults?: Partial<Task> & { date?: string } }
  | { kind: 'event'; id?: string; date?: string; time?: string }
  | { kind: 'habit'; id?: string }
  | { kind: 'goal'; id?: string; horizon?: 'weekly' | 'short' | 'long' }
  | { kind: 'class'; id?: string }
  | { kind: 'project'; id?: string }
  | null;

interface UIState {
  modal: ModalState;
  paletteOpen: boolean;
  mobileNavOpen: boolean;
  open(m: NonNullable<ModalState>): void;
  close(): void;
  setPalette(open: boolean): void;
  setMobileNav(open: boolean): void;
}

export const useUI = create<UIState>()((set) => ({
  modal: null,
  paletteOpen: false,
  mobileNavOpen: false,
  open: (modal) => set({ modal, paletteOpen: false }),
  close: () => set({ modal: null }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
}));

export const openModal = (m: NonNullable<ModalState>) => useUI.getState().open(m);
