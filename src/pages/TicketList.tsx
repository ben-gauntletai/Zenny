import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ticketService } from '../services/ticketService';
import '../styles/TicketList.css';

interface FormattedTicket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'solved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  description: string;
  updated_at: string;
  ticket_type: string;
  topic: string;
  creator_email: string;
  agent_email?: string;
}

interface FilterState {
  status: string;
  priority: string;
  assignee: string;
  sortBy: 'created_at' | 'priority' | 'status';
  sortOrder: 'asc' | 'desc';
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
      const response = await ticketService.listTickets({
        status: filters.status || undefined,
        limit: 100,
        offset: 0
      });

      if (!response.tickets) {
        throw new Error('Invalid response format');
      }

      let filteredTickets = response.tickets;

      // Apply client-side filters
      if (filters.priority) {
        filteredTickets = filteredTickets.filter((ticket: FormattedTicket) => ticket.priority === filters.priority);
      }

      if (isAgent && filters.assignee === 'me') {
        filteredTickets = filteredTickets.filter((ticket: FormattedTicket) => ticket.agent_email === user?.email);
      } else if (isAgent && filters.assignee === 'unassigned') {
        filteredTickets = filteredTickets.filter((ticket: FormattedTicket) => !ticket.agent_email);
      }

      // Apply sorting
      filteredTickets.sort((a: FormattedTicket, b: FormattedTicket) => {
        const aValue = a[filters.sortBy];
        const bValue = b[filters.sortBy];
        const order = filters.sortOrder === 'asc' ? 1 : -1;
        
        if (aValue < bValue) return -1 * order;
        if (aValue > bValue) return 1 * order;
        return 0;
      });

      setTickets(filteredTickets);
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
          <option value="closed">Closed</option>
        </select>

        <select
          value={filters.priority}
          onChange={(e) => handleFilterChange('priority', e.target.value)}
          className="filter-select"
        >
          <option value="">All Priority</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
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
                      {ticket.subject}
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
                  {isAgent && <td>{ticket.creator_email}</td>}
                  <td>{ticket.agent_email || 'Unassigned'}</td>
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