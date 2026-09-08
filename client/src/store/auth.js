import { create } from 'zustand';
import api from '../lib/api';

const ACTIVE_KEY = 'mm.activeProfile';

export const useAuth = create((set, get) => ({
  status: 'loading', // loading | anon | auth
  user: null,
  profiles: [],
  activeProfileId: null,

  setActiveProfile(id) {
    if (get().profiles.some((p) => p.id === id)) {
      try { localStorage.setItem(ACTIVE_KEY, String(id)); } catch { /* ignore */ }
      set({ activeProfileId: id });
    }
  },

  activeProfile() {
    const { profiles, activeProfileId } = get();
    return profiles.find((p) => p.id === activeProfileId) || profiles[0] || null;
  },

  async hydrate() {
    try {
      const data = await api.get('/auth/me');
      let saved = null;
      try { saved = Number(localStorage.getItem(ACTIVE_KEY)); } catch { /* ignore */ }
      const profiles = data.profiles || [];
      const valid = profiles.some((p) => p.id === saved) ? saved : profiles[0]?.id || null;
      set({ status: 'auth', user: data.user, profiles, activeProfileId: valid });
    } catch {
      set({ status: 'anon', user: null, profiles: [], activeProfileId: null });
    }
  },

  async login(usernameOrEmail, password) {
    const data = await api.post('/auth/login', { usernameOrEmail, password });
    await get().hydrate();
    return data;
  },

  async signup(username, email, password) {
    const data = await api.post('/auth/signup', { username, email, password });
    await get().hydrate();
    return data;
  },

  async logout() {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
    set({ status: 'anon', user: null, profiles: [], activeProfileId: null });
  },

  applyProfiles(profiles) {
    const { activeProfileId } = get();
    const valid = profiles.some((p) => p.id === activeProfileId)
      ? activeProfileId
      : profiles[0]?.id || null;
    if (valid !== activeProfileId) {
      try { localStorage.setItem(ACTIVE_KEY, String(valid)); } catch { /* ignore */ }
    }
    set({ profiles, activeProfileId: valid });
  },

  patchProfile(profile) {
    const profiles = get().profiles.map((p) => (p.id === profile.id ? { ...p, ...profile } : p));
    get().applyProfiles(profiles);
  },
}));
