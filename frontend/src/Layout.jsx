import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import './Layout.css';

function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <div className="layout-container">
      {/* Header */}
      <header className="layout-header">
        <div className="layout-header-content">
          <h1 className="layout-app-name">Customer Verification Portal</h1>
          <div className="layout-user-info">
            <span className="layout-customer-name">{user?.name || 'Customer'}</span>
            <button className="layout-logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <div className="layout-body">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <ul className="nav-list">
              <li className={`nav-item ${isActive('/dashboard')}`}>
                <Link to="/dashboard" className="nav-link">Dashboard</Link>
              </li>
              <li className={`nav-item ${isActive('/documents')}`}>
                <Link to="/documents" className="nav-link">My Documents</Link>
              </li>
              <li className={`nav-item ${isActive('/status')}`}>
                <Link to="/status" className="nav-link">Verification Status</Link>
              </li>
              <li className={`nav-item ${isActive('/help')}`}>
                <Link to="/help" className="nav-link">Help / AI Assistant</Link>
              </li>
            </ul>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;