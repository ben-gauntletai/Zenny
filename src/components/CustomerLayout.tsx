import React from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { CustomerProvider } from '../contexts/CustomerContext';

const CustomerLayout: React.FC = () => {
  const location = useLocation();

  return (
    <div className="customers-page">
      <Navigation />
      <div className="customer-content-wrapper">
        <div className="customer-sidebar">
          <div className="customer-lists">
            <div className="customer-lists-header">Customer lists</div>
            <Link 
              to="/customers" 
              className={`customer-list-item ${location.pathname === '/customers' ? 'active' : ''}`}
            >
              All customers
            </Link>
            <Link 
              to="/customers/suspended" 
              className={`customer-list-item ${location.pathname === '/customers/suspended' ? 'active' : ''}`}
            >
              Suspended users
            </Link>
          </div>
        </div>

        <CustomerProvider>
          <Outlet />
        </CustomerProvider>
      </div>
    </div>
  );
};

export default CustomerLayout; 