import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navigation from './Navigation';
import { AutoCRMPanel } from './AutoCRMPanel';
import { useAuth } from '../contexts/AuthContext';
import '../styles/TicketLayout.css';

const TicketLayout: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';
  const shouldShowAutoCRM = location.pathname === '/tickets';

  return (
    <>
      <Navigation />
      <div className={`tickets-content ${isAgentOrAdmin && shouldShowAutoCRM ? 'with-autocrm' : ''}`}>
        <div className="tickets-main">
          <Outlet />
        </div>
        <AutoCRMPanel />
      </div>
    </>
  );
};

export default TicketLayout;