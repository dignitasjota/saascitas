import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
}

interface AuthState {
  // Tokens live in httpOnly cookies (out of JS reach). We only keep the
  // non-sensitive identity here, persisted so the UI knows there's a session.
  user: User | null;
  tenant: Tenant | null;

  setAuth: (user: User, tenant: Tenant) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,

      setAuth: (user, tenant) => set({ user, tenant }),

      logout: () => {
        set({ user: null, tenant: null });
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      },

      isAuthenticated: () => !!get().user,
    }),
    {
      name: 'saascitas-auth',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
      }),
    },
  ),
);
