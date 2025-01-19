import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Navigation from '../components/Navigation';
import { supabase } from '../lib/supabaseClient';
import '../styles/Customers.css';

interface SuspendedUser {
  id: string;
  name: string;
  email: string;
  reason: string;
  suspended_by: string;
  suspended_date: string;
}

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="search">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
);

const MoreIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="more-icon" style={{ width: '16px', height: '16px' }}>
    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
  </svg>
);

const SuspendedUsers: React.FC = () => {
  const location = useLocation();
  const [users, setUsers] = useState<SuspendedUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeList, setActiveList] = useState('suspended');

  useEffect(() => {
    fetchSuspendedUsers();
  }, []);

  const fetchSuspendedUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('suspended_users')
        .select('*')
        .order('suspended_date', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching suspended users:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    try {
      const { data, error } = await supabase
        .from('suspended_users')
        .select('*')
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .order('suspended_date', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error searching suspended users:', error.message);
    }
  };

  const formatDate = (date: string): string => {
    const now = new Date();
    const suspendedDate = new Date(date);
    const diffInMinutes = Math.floor((now.getTime() - suspendedDate.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) {
      return 'less than a minute ago';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
    } else if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else {
      return suspendedDate.toLocaleDateString();
    }
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
          <h1 className="customers-title">Suspended users</h1>
        </div>

        <div className="customers-content">
          <div className="customers-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search suspended users"
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
                  <th>Reason</th>
                  <th>Suspended by</th>
                  <th>Suspended date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <input type="checkbox" />
                    </td>
                    <td>
                      <div className="customer-name">
                        <div className="customer-avatar">
                          {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <span>{user.name}</span>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.reason}</td>
                    <td>
                      <Link to={`/users/${user.suspended_by}`} className="suspended-by-link">
                        {user.suspended_by}
                      </Link>
                    </td>
                    <td>{formatDate(user.suspended_date)}</td>
                    <td>
                      <button className="more-button">
                        <MoreIcon />
                      </button>
                    </td>
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

export default SuspendedUsers; 