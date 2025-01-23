import React, { useState } from 'react';
import { useCustomers } from '../contexts/CustomerContext';
import '../styles/Customers.css';

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="search">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
);

const CustomerList: React.FC = () => {
  const { customers, loading, searchCustomers } = useCustomers();
  const [searchQuery, setSearchQuery] = useState('');

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleString();
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    searchCustomers(value);
  };

  if (loading) {
    return null; // Don't show loading state since data is pre-fetched
  }

  return (
    <div className="customers-main">
      <div className="customers-header">
        <h1 className="customers-title">Customers</h1>
      </div>

      <div className="customers-content">
        <div className="customers-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search customers"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        <div className="customers-table-container">
          <table className="customers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div className="customer-name">
                      <div className="customer-avatar">
                        {customer.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <span>{customer.name}</span>
                    </div>
                  </td>
                  <td>{customer.email}</td>
                  <td className="last-updated">{formatDate(customer.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CustomerList; 