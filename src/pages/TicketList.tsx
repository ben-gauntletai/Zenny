import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Ticket as SupabaseTicket, Profile } from '../lib/supabaseClient';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/TicketList.css';

interface FormattedTicket extends Omit<SupabaseTicket, 'user_id' | 'assigned_to'> {
  user: { email: string };
  agent?: { email: string };
}

interface FilterState {
  status: string;
  priority: string;
  assignee: string;
  sortBy: 'created_at' | 'priority' | 'status';
  sortOrder: 'asc' | 'desc';
}

interface UserMapProfile {
  id: string;
  email: string;
}

const TicketList: React.FC = () => {
  const { user } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';
  const [tickets, setTickets] = useState<FormattedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    status: '',
    priority: '',
    assignee: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
  });

  useEffect(() => {
    fetchTickets();
  }, [filters, user?.id]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('tickets')
        .select('*');

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (!isAgent) {
        query = query.eq('user_id', user?.id);
      } else if (filters.assignee === 'me') {
        query = query.eq('assigned_to', user?.id);
      } else if (filters.assignee === 'unassigned') {
        query = query.is('assigned_to', null);
      }

      // Apply sorting
      query = query.order(filters.sortBy, { ascending: filters.sortOrder === 'asc' });

      const { data: ticketData, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Fetch user information for each ticket
      const userIds = Array.from(new Set(ticketData?.map((t: SupabaseTicket) => t.user_id) || []));
      const assignedToIds = Array.from(new Set(ticketData?.map((t: SupabaseTicket) => t.assigned_to).filter(Boolean) || []));
      const allUserIds = Array.from(new Set([...userIds, ...assignedToIds]));

      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', allUserIds);

      if (userError) throw userError;

      const userMap = (userData || []).reduce<Record<string, UserMapProfile>>((acc, user) => {
        acc[user.id] = {
          id: user.id,
          email: user.email
        };
        return acc;
      }, {});
      
      const formattedTickets: FormattedTicket[] = (ticketData || []).map((ticket: SupabaseTicket) => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        created_at: ticket.created_at,
        description: ticket.description,
        updated_at: ticket.updated_at,
        user: { email: userMap[ticket.user_id]?.email || 'Unknown' },
        agent: ticket.assigned_to ? { email: userMap[ticket.assigned_to]?.email || 'Unassigned' } : undefined
      }));

      setTickets(formattedTickets);
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

  if (loading) {
    return <div className="loading">Loading tickets...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="ticket-list">
      <header className="ticket-list-header">
        <div className="header-content">
          <h1>Support Tickets</h1>
          <p className="subtitle">Manage and track support requests</p>
        </div>
        <Link to="/tickets/new" className="create-ticket-button">
          Create Ticket
        </Link>
      </header>

      <div className="filters">
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="filter-select"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="solved">Solved</option>
        </select>

        <select
          value={filters.priority}
          onChange={(e) => handleFilterChange('priority', e.target.value)}
          className="filter-select"
        >
          <option value="">All Priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        {isAgent && (
          <select
            value={filters.assignee}
            onChange={(e) => handleFilterChange('assignee', e.target.value)}
            className="filter-select"
          >
            <option value="">All Tickets</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        )}

        <select
          value={filters.sortBy}
          onChange={(e) => handleFilterChange('sortBy', e.target.value as any)}
          className="filter-select"
        >
          <option value="created_at">Sort by Date</option>
          <option value="priority">Sort by Priority</option>
          <option value="status">Sort by Status</option>
        </select>

        <select
          value={filters.sortOrder}
          onChange={(e) => handleFilterChange('sortOrder', e.target.value as 'asc' | 'desc')}
          className="filter-select"
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
      </div>

      {tickets.length === 0 ? (
        <div className="no-tickets">
          <p>No tickets found</p>
          <Link to="/tickets/new" className="create-ticket-button">
            Create Your First Ticket
          </Link>
        </div>
      ) : (
        <div className="tickets-table-container">
          <table className="tickets-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Created</th>
                {isAgent && <th>Requester</th>}
                <th>Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => (
                <tr key={ticket.id}>
                  <td>
                    <Link to={`/tickets/${ticket.id}`} className="ticket-subject">
                      {ticket.title}
                    </Link>
                  </td>
                  <td>
                    <span className={`status-badge ${ticket.status.toLowerCase()}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td>
                    <span className={`priority-badge ${ticket.priority.toLowerCase()}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                  {isAgent && <td>{ticket.user.email}</td>}
                  <td>{ticket.agent?.email || 'Unassigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TicketList; 