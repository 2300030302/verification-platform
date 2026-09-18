import React, { useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import { AuthContext } from './authContextDef';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      if (!savedUser || savedUser === 'undefined' || savedUser === 'null') return null;
      const parsed = JSON.parse(savedUser);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => {
    try {
      const savedToken = localStorage.getItem('token');
      if (!savedToken || savedToken === 'undefined' || savedToken === 'null') return null;
      return savedToken;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyExistingToken = async () => {
      let savedToken = null;
      try {
        savedToken = localStorage.getItem('token');
        if (savedToken === 'undefined' || savedToken === 'null') savedToken = null;
      } catch {
        savedToken = null;
      }

      if (savedToken) {
        try {
          const data = await authAPI.getCurrentUser();
          if (data && data.user) {
            setUser(data.user);
            try {
              localStorage.setItem('user', JSON.stringify(data.user));
            } catch {}
          }
        } catch {
          // Token invalid or expired
          try {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          } catch {}
          setUser(null);
          setToken(null);
        }
      }
      setLoading(false);
    };

    verifyExistingToken();
  }, []);

  const login = (newToken, newUser) => {
    try {
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
    } catch (e) {
      console.warn('Unable to persist session to localStorage:', e);
    }
    setToken(newToken);
    setUser(newUser);
    setLoading(false);
  };

  const logout = () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch {}
    setToken(null);
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

