import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Navigation.css';

const Navigation: React.FC = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const isAgent = user?.user_metadata?.role === 'agent';

  const isActive = (path: string) => {
    return location.pathname.startsWith(path) ? 'active' : '';
  };

  return (
    <nav className="main-nav">
      <div className="nav-brand">
        <Link to="/">Zenny</Link>
      </div>
      
      <div className="nav-links">
        <Link to="/" className={isActive('/')}>
          Dashboard
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
          Sign out
        </button>
      </div>
    </nav>
  );
};

export default Navigation; 