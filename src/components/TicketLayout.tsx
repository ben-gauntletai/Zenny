import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import '../styles/TicketLayout.css';

const TicketLayout: React.FC = () => {
  return (
    <>
      <Navigation />
      <div className="tickets-content">
        <div className="tickets-main">
          <Outlet />
        </div>
      </div>
    </>
  );
};

export default TicketLayout; 