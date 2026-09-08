import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthState, LoginCredentials, RegisterData } from '../types/auth';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Real backend-controlled identity (Phase 0 §2) — replaces the old mock
// in-memory user array + localStorage. The session itself lives in an
// httpOnly cookie set by the server (never readable by page JS); this
// component only ever holds the patient's public profile in memory/state.
const API_BASE = import.meta.env.VITE_API_URL || 'https://dr-majeke-production.up.railway.app';

async function apiCall(path: string, body?: object) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // send/receive the session cookie
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ success: false }));
  return { ok: res.ok, data };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Restore the session (if any) on load by asking the server who the
  // current cookie belongs to — there's nothing durable to read locally.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/me`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setAuthState({ user: mapPatient(data.patient), isAuthenticated: true, isLoading: false });
          return;
        }
      } catch {
        // network error — fall through to signed-out state
      }
      setAuthState(prev => ({ ...prev, isLoading: false }));
    })();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    const { ok, data } = await apiCall('/api/v1/auth/login', credentials);
    if (ok && data.success) {
      setAuthState({ user: mapPatient(data.patient), isAuthenticated: true, isLoading: false });
      return true;
    }
    setAuthState(prev => ({ ...prev, isLoading: false }));
    return false;
  };

  const register = async (data: RegisterData): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    const { ok, data: res } = await apiCall('/api/v1/auth/register', {
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: data.password,
    });
    if (ok && res.success) {
      setAuthState({ user: mapPatient(res.patient), isAuthenticated: true, isLoading: false });
      return true;
    }
    setAuthState(prev => ({ ...prev, isLoading: false }));
    return false;
  };

  const logout = () => {
    setAuthState({ user: null, isAuthenticated: false, isLoading: false });
    fetch(`${API_BASE}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Maps the server's patient record (canonical patient_id + attributes)
// onto the User shape the rest of the website already expects.
function mapPatient(patient: any): User {
  return {
    id: patient.patient_id || patient.id,
    name: patient.name,
    email: patient.email,
    phone: patient.phone,
    role: 'user',
    createdAt: patient.created_at,
  };
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
