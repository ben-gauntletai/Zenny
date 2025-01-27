import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { DashboardProvider } from '../contexts/DashboardContext';
import { AutoCRMPanel } from './AutoCRMPanel';

const DashboardLayout: React.FC = () => {
  return (
    <div className="dashboard-page">
      <Navigation />
      <div className="dashboard-content">
        <DashboardProvider>
          <Outlet />
          <AutoCRMPanel />
        </DashboardProvider>
      </div>
    </div>
  );
};

export default DashboardLayout; 