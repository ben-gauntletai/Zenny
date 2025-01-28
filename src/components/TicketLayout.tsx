import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { AutoCRMPanel } from './AutoCRMPanel';
import { useAuth } from '../contexts/AuthContext';
import '../styles/TicketLayout.css';

const TicketLayout: React.FC = () => {
  const { user } = useAuth();
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';

  return (
    <>
      <Navigation />
      <div className={`tickets-content ${isAgentOrAdmin ? 'with-autocrm' : ''}`}>
        <div className="tickets-main">
          <Outlet />
        </div>
        <AutoCRMPanel />
      </div>
    </>
  );
};

export default TicketLayout;