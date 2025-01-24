import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ticketService } from '../services/ticketService';
import '../styles/TicketList.css';

interface TicketWithUsers {
  id: number;
  subject: string;
  status: 'open' | 'pending' | 'solved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  user_id: string;
  assigned_to?: string;
  group_id?: string;
  creator_email: string;
  creator_name?: string;
  agent_email?: string;
  agent_name?: string;
  group_name?: string;
}

interface FilterState {
  status: string;
  priority: string;
  assignee: string;
}

const TicketList: React.FC = () => {
  const [tickets, setTickets] = useState<TicketWithUsers[]>([]);
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
      const response = await ticketService.listTickets({
        status: filters.status || undefined,
        limit: 100,
        offset: 0
      });

      let filteredTickets = response.tickets;

      // Apply client-side filters
      if (filters.priority) {
        filteredTickets = filteredTickets.filter(ticket => ticket.priority === filters.priority);
      }

      if (isAgent) {
        if (filters.assignee === 'me') {
          filteredTickets = filteredTickets.filter(ticket => ticket.assigned_to === user?.id);
        } else if (filters.assignee === 'unassigned') {
          filteredTickets = filteredTickets.filter(ticket => !ticket.assigned_to);
        }
      }

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

  return (
    <div className="ticket-list-container">
      <div className="ticket-list-header">
        <h2>Support Tickets</h2>
        <Link to="/tickets/new" className="create-ticket-button">
          Create New Ticket
        </Link>
      </div>

      <div className="tickets-scroll-container">
        {loading ? (
          <div className="loading">Loading tickets...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : tickets.length === 0 ? (
          <div className="no-tickets">
            <p>No tickets found</p>
            <Link to="/tickets/new" className="create-ticket-button">
              Create your first ticket
            </Link>
          </div>
        ) : (
          <div className="ticket-list">
            {tickets.map((ticket) => (
              <Link to={`/tickets/${ticket.id}`} key={ticket.id} className="ticket-card">
                <div className="ticket-header">
                  <span className={`status-badge ${ticket.status}`}>
                    {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
                  </span>
                  <span className={`priority-badge ${ticket.priority}`}>
                    {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                  </span>
                </div>
                <h3 className="ticket-subject">{ticket.subject}</h3>
                <div className="ticket-meta">
                  <span>Created by: {ticket.creator_name || ticket.creator_email}</span>
                  <span>Assigned to: {ticket.agent_name || ticket.agent_email || 'Unassigned'}</span>
                  <span>Group: {ticket.group_name || 'None'}</span>
                </div>
                <div className="ticket-date">
                  {new Date(ticket.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketList; 
