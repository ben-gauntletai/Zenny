import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { TicketProvider } from '../contexts/TicketContext';

const TicketLayout: React.FC = () => {
  return (
    <div className="tickets-page">
      <Navigation />
      <div className="tickets-content">
        <TicketProvider>
          <Outlet />
        </TicketProvider>
      </div>
    </div>
  );
};

export default TicketLayout; 