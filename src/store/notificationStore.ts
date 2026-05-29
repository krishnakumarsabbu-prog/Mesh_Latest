import { create } from 'zustand';
import { Notification } from '@/types';

interface NotificationStore {
  notifications: Notification[];
  add: (notification: Omit<Notification, 'id'>) => void;
  remove: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  add: (notification) => {
    const id = `notif-${++counter}`;
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }],
    }));
  },
  remove: (id) =>
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
  clear: () => set({ notifications: [] }),
}));

export const notify = {
  success: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'success', title, message }),
  error: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'error', title, message, duration: 6000 }),
  warning: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'warning', title, message }),
  info: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'info', title, message }),
};
