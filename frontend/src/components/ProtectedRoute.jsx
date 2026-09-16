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
      // Redirect based on user's actual role
      if (userRole === 'officer') {
        return <Navigate to="/officer/dashboard" replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
}
