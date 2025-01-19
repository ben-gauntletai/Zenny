import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Navigation.css';

const Navigation: React.FC = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const isAgent = user?.user_metadata?.role === 'agent';

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <nav className="navigation">
      <div className="nav-content">
        <div className="nav-brand">
          <Link to="/">Zenny</Link>
        </div>
        <div className="nav-links">
          <Link to="/" className={isActive('/')}>
            Dashboard
          </Link>
          <Link to="/customers" className={isActive('/customers')}>
            Customers
          </Link>
          <Link to="/tickets" className={isActive('/tickets')}>
            Tickets
          </Link>
          <Link to="/knowledge-base" className={isActive('/knowledge-base')}>
            Knowledge Base
          </Link>
          {isAgent && (
            <Link to="/knowledge-base/analytics" className={isActive('/knowledge-base/analytics')}>
              Analytics
            </Link>
          )}
        </div>
        <div className="nav-user">
          {isAgent && <span className="agent-badge">Agent</span>}
          <button onClick={signOut} className="sign-out-button">
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navigation; 