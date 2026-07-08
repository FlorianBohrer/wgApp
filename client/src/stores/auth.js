import { defineStore } from 'pinia';
import { api, setTokens, hasSession, setLogoutHandler, disconnectEvents } from '../api.js';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    status: 'loading', // loading | anon | noWg | ready
    user: null,
    wg: null,
    members: []
  }),
  getters: {
    membersById() {
      return Object.fromEntries(this.members.map((m) => [m.id, m]));
    },
    activeMembers() {
      return this.members.filter((m) => m.active);
    }
  },
  actions: {
    async init() {
      setLogoutHandler(() => this.reset());
      if (!hasSession()) {
        this.status = 'anon';
        return;
      }
      try {
        await this.loadMe();
      } catch {
        // Offline mit gültiger Session: zuletzt bekannte Daten aus dem Cache nutzen
        this.status = this.user ? this.status : 'anon';
      }
    },
    async loadMe() {
      const me = await api('GET', '/api/me');
      this.user = me.user;
      this.wg = me.wg;
      if (me.wg) {
        await this.loadWg();
        this.status = 'ready';
      } else {
        this.status = 'noWg';
      }
    },
    async loadWg() {
      const wg = await api('GET', '/api/wg');
      this.wg = { id: wg.id, name: wg.name, isAdmin: wg.isAdmin, inviteCode: wg.inviteCode, adminId: wg.adminId };
      this.members = wg.members;
    },
    async login(email, password) {
      const data = await api('POST', '/api/auth/login', { email, password }, { auth: false });
      setTokens(data.accessToken, data.refreshToken);
      await this.loadMe();
    },
    async register(email, name, password) {
      const data = await api('POST', '/api/auth/register', { email, name, password }, { auth: false });
      setTokens(data.accessToken, data.refreshToken);
      await this.loadMe();
    },
    async createWg(name) {
      await api('POST', '/api/wg', { name });
      await this.loadMe();
    },
    async joinWg(code) {
      await api('POST', '/api/wg/join', { code });
      await this.loadMe();
    },
    async logout() {
      const refresh = localStorage.getItem('wg.refresh');
      try {
        await api('POST', '/api/auth/logout', { refreshToken: refresh });
      } catch { /* Logout darf nie scheitern */ }
      this.reset();
    },
    reset() {
      setTokens(null, null);
      disconnectEvents();
      this.user = null;
      this.wg = null;
      this.members = [];
      this.status = 'anon';
    }
  }
});
