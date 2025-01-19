import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Navigation from '../components/Navigation';
import '../styles/Customers.css';

interface Customer {
  id: string;
  name: string;
  email: string;
  tags: string[];
  timezone: string;
  group_name?: string;
  user_type: string;
  access: string;
  organization?: string;
  language: string;
  details?: any;
  notes?: string;
  updated_at: string;
}

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="search">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
);

const CustomerList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeList, setActiveList] = useState('all');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error fetching customers:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error searching customers:', error.message);
    }
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleString();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="customers-page">
      <Navigation />
      
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

      <div className="customers-main">
        <div className="customers-header">
          <h1 className="customers-title">Customers</h1>
          <div className="customers-header-actions">
            <button className="secondary-button">Bulk import</button>
            <button className="primary-button">Add customer</button>
          </div>
        </div>

        <div className="customers-content">
          <div className="customers-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search customers"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
            />
          </div>

          <div className="customers-table-container">
            <table className="customers-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" />
                  </th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Tags</th>
                  <th>Timezone</th>
                  <th>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer: Customer) => (
                  <tr key={customer.id}>
                    <td>
                      <input type="checkbox" />
                    </td>
                    <td>
                      <div className="customer-name">
                        <div className="customer-avatar">JD</div>
                        <span>{customer.name}</span>
                      </div>
                    </td>
                    <td>{customer.email}</td>
                    <td>
                      <div className="tags">
                        {customer.tags?.map((tag: string, index: number) => (
                          <span key={index} className="tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="timezone">{customer.timezone}</td>
                    <td className="last-updated">{formatDate(customer.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerList; 