import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { DashboardProvider } from '../contexts/DashboardContext';
import { AutoCRMPanel } from './AutoCRMPanel';
import { useAuth } from '../contexts/AuthContext';
import '../styles/DashboardLayout.css';

const DashboardLayout: React.FC = () => {
  const { user } = useAuth();
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';

  return (
    <div className="dashboard-page">
      <Navigation />
      <div className={`dashboard-content ${isAgentOrAdmin ? 'with-autocrm' : ''}`}>
        <DashboardProvider>
          <Outlet />
          <AutoCRMPanel />
        </DashboardProvider>
      </div>
    </div>
  );
};

export default DashboardLayout;