import { defineStore } from 'pinia';
import { api } from '../api.js';
import { todayIso } from '../format.js';

export const useTasksStore = defineStore('tasks', {
  state: () => ({ open: [], done: [], rotations: [], swaps: [], today: todayIso(), loaded: false }),
  actions: {
    async fetch() {
      const data = await api('GET', '/api/tasks');
      Object.assign(this, data, { loaded: true });
    }
  }
});

export const useShoppingStore = defineStore('shopping', {
  state: () => ({ lists: [], loaded: false }),
  actions: {
    async fetch() {
      const data = await api('GET', '/api/shopping');
      this.lists = data.lists;
      this.loaded = true;
    }
  }
});

export const useCostsStore = defineStore('costs', {
  state: () => ({ balances: [], suggestions: [], expenses: [], settlements: [], log: [], loaded: false }),
  actions: {
    async fetch() {
      const data = await api('GET', '/api/costs');
      Object.assign(this, data, { loaded: true });
    }
  }
});

export const useBucketStore = defineStore('bucket', {
  state: () => ({ items: [], loaded: false }),
  actions: {
    async fetch() {
      const data = await api('GET', '/api/bucket');
      this.items = data.items;
      this.loaded = true;
    }
  }
});

export const useFeedbackStore = defineStore('feedback', {
  state: () => ({ feed: [], loaded: false }),
  actions: {
    async fetch() {
      const data = await api('GET', '/api/feedback');
      this.feed = data.feed;
      this.loaded = true;
    }
  }
});

export const useNotifStore = defineStore('notifications', {
  state: () => ({ list: [], unread: 0, settings: null }),
  actions: {
    async fetch() {
      const data = await api('GET', '/api/notifications');
      this.list = data.list;
      this.unread = data.unread;
    },
    async markAllRead() {
      if (!this.unread) return;
      await api('POST', '/api/notifications/read');
      this.unread = 0;
      this.list.forEach((n) => (n.read = 1));
    },
    async loadSettings() {
      this.settings = await api('GET', '/api/notification-settings');
    },
    async saveSettings() {
      await api('PUT', '/api/notification-settings', this.settings);
    }
  }
});
