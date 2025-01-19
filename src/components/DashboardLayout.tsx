import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { DashboardProvider } from '../contexts/DashboardContext';

const DashboardLayout: React.FC = () => {
  return (
    <div className="dashboard-page">
      <Navigation />
      <div className="dashboard-content">
        <DashboardProvider>
          <Outlet />
        </DashboardProvider>
      </div>
    </div>
  );
};

export default DashboardLayout; 