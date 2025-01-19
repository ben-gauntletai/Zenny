import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import '../styles/CustomerList.css';

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

const CustomerList: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

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
    <div className="container">
      <div className="header">
        <div className="search-container">
          <input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button onClick={handleSearch} className="search-button">
            Search
          </button>
        </div>
        <button onClick={() => window.location.href = '/customers/new'} className="add-button">
          Add customer
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Tags</th>
              <th>Organization</th>
              <th>Timezone</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer: Customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
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
                <td>{customer.organization || '-'}</td>
                <td>{customer.timezone}</td>
                <td>{formatDate(customer.updated_at)}</td>
                <td>
                  <div className="actions">
                    <button
                      onClick={() => window.location.href = `/customers/${customer.id}`}
                      className="action-button"
                    >
                      View
                    </button>
                    <button
                      onClick={() => window.location.href = `/customers/${customer.id}/edit`}
                      className="action-button"
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerList; 