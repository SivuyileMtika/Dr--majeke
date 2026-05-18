import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthState, LoginCredentials, RegisterData } from '../types/auth';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mockUsers: (User & { password: string })[] = [];

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setAuthState({ user, isAuthenticated: true, isLoading: false });
      } catch {
        localStorage.removeItem('user');
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = async (credentials: LoginCredentials): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    const user = mockUsers.find(u => u.email === credentials.email && u.password === credentials.password);
    if (user) {
      const { password, ...userWithoutPassword } = user;
      setAuthState({ user: userWithoutPassword, isAuthenticated: true, isLoading: false });
      localStorage.setItem('user', JSON.stringify(userWithoutPassword));
      return true;
    }
    setAuthState(prev => ({ ...prev, isLoading: false }));
    return false;
  };

  const register = async (data: RegisterData): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    if (mockUsers.find(u => u.email === data.email)) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
    const newUser = {
      id: Date.now().toString(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: 'user' as const,
      password: data.password,
      createdAt: new Date().toISOString(),
    };
    mockUsers.push(newUser);
    const { password, ...userWithoutPassword } = newUser;
    setAuthState({ user: userWithoutPassword, isAuthenticated: true, isLoading: false });
    localStorage.setItem('user', JSON.stringify(userWithoutPassword));
    return true;
  };

  const logout = () => {
    setAuthState({ user: null, isAuthenticated: false, isLoading: false });
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
