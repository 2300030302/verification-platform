import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
        color: '#4b5563',
        background: '#f9fafb',
      }}>
        <p>Loading session...</p>
      </div>
    );
  }

  // Not logged in -> redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role authorization
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = (user.role || '').toLowerCase();
    const isAllowed = allowedRoles.some((r) => r.toLowerCase() === userRole);

    if (!isAllowed) {
      // Redirect based on user's actual role, avoiding infinite loop if already at target
      const fallbackPath = userRole === 'officer' ? '/officer/dashboard' : '/dashboard';
      if (location.pathname === fallbackPath) {
        return (
          <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '1rem',
            fontFamily: 'sans-serif',
            color: '#4b5563',
            background: '#f9fafb',
          }}>
            <h2>Access Denied</h2>
            <p>You do not have permission to view this page.</p>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.clear();
                } catch {}
                window.location.href = '/login';
              }}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: 'white',
                color: '#1f2937',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Sign In with different credentials
            </button>
          </div>
        );
      }
      return <Navigate to={fallbackPath} replace />;
    }
  }

  return children;
}
