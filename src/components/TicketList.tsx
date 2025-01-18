import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

interface Ticket {
  id: string;
  title: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  user_id: string;
  assigned_to: string | null;
  users: {
    email: string;
  };
  assigned_user?: {
    email: string;
  };
}

interface FilterState {
  status: string;
  priority: string;
  assignee: string;
}

const TicketList: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    status: '',
    priority: '',
    assignee: ''
  });
  
  const { user } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';

  useEffect(() => {
    fetchTickets();
  }, [filters]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('tickets')
        .select(`
          *,
          users!tickets_user_id_fkey (email),
          assigned_user:users!tickets_assigned_to_fkey (email)
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters.assignee === 'me') {
        query = query.eq('assigned_to', user?.id);
      } else if (filters.assignee === 'unassigned') {
        query = query.is('assigned_to', null);
      }

      const { data, error: fetchError } = await query;
      
      if (fetchError) throw fetchError;
      setTickets(data || []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="loading">Loading tickets...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="ticket-list">
      <div className="ticket-list-header">
        <h2>Support Tickets</h2>
        <Link to="/tickets/new" className="create-ticket-button">
          Create New Ticket
        </Link>
      </div>

      <div className="filters">
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
        </select>

        <select
          value={filters.priority}
          onChange={(e) => handleFilterChange('priority', e.target.value)}
        >
          <option value="">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        {isAgent && (
          <select
            value={filters.assignee}
            onChange={(e) => handleFilterChange('assignee', e.target.value)}
          >
            <option value="">All Tickets</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        )}
      </div>

      <div className="tickets-table">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Requester</th>
              <th>Assignee</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map(ticket => (
              <tr key={ticket.id}>
                <td>#{ticket.id.slice(0, 8)}</td>
                <td>
                  <Link to={`/tickets/${ticket.id}`} className="ticket-link">
                    {ticket.title}
                  </Link>
                </td>
                <td>
                  <span className={`status-badge status-${ticket.status}`}>
                    {ticket.status}
                  </span>
                </td>
                <td>
                  <span className={`priority-badge priority-${ticket.priority}`}>
                    {ticket.priority}
                  </span>
                </td>
                <td>{ticket.users.email}</td>
                <td>{ticket.assigned_user?.email || 'Unassigned'}</td>
                <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TicketList; 
