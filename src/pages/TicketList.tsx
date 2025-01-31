import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ticketService } from '../services/ticketService';
import { supabase } from '../lib/supabaseClient';
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
  creator_name?: string;
  agent_name?: string;
  group_name?: string;
}

interface FilterState {
  status: string;
  priority: string;
  assignee: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
}

const TicketList: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';
  const [allTickets, setAllTickets] = useState<FormattedTicket[]>([]);
  const [displayedTickets, setDisplayedTickets] = useState<FormattedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    status: '',
    priority: '',
    assignee: '',
    sortField: 'created_at',
    sortDirection: 'desc'
  });
  const subscriptionRef = useRef<any>(null);

  // Only fetch tickets when component mounts or user changes
  useEffect(() => {
    fetchTickets();

    // Set up real-time subscription
    if (user) {
      console.log('Setting up real-time subscription for tickets');
      subscriptionRef.current = supabase
        .channel('tickets-list-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tickets'
          },
          async (payload) => {
            console.log('Ticket change received:', payload);
            // Refresh tickets data to get the latest state
            await fetchTickets();
          }
        )
        .subscribe();

      // Cleanup subscription on unmount
      return () => {
        console.log('Cleaning up ticket subscription');
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
        }
      };
    }
  }, [user?.id]);

  // Apply filters and sorting locally
  useEffect(() => {
    if (allTickets.length > 0) {
      let filteredTickets = [...allTickets];

      // Apply filters
      if (filters.status) {
        filteredTickets = filteredTickets.filter(ticket => ticket.status === filters.status);
      }
      if (filters.priority) {
        filteredTickets = filteredTickets.filter(ticket => ticket.priority === filters.priority);
      }
      if (isAgentOrAdmin && filters.assignee) {
        if (filters.assignee === 'me') {
          filteredTickets = filteredTickets.filter(ticket => ticket.agent_email === user?.email);
        } else if (filters.assignee === 'unassigned') {
          filteredTickets = filteredTickets.filter(ticket => !ticket.agent_email);
        }
      }

      // Apply sorting
      filteredTickets.sort((a, b) => {
        const direction = filters.sortDirection === 'asc' ? 1 : -1;
        
        switch (filters.sortField) {
          case 'id':
            return (parseInt(a.id) - parseInt(b.id)) * direction;
          case 'created_at':
            return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction;
          case 'priority':
            return getPriorityOrder(a.priority, b.priority) * direction;
          case 'status':
            return a.status.localeCompare(b.status) * direction;
          case 'subject':
            return (a.subject || '').localeCompare(b.subject || '') * direction;
          default:
            return 0;
        }
      });

      // Trigger animation when tickets change
      setShouldAnimate(true);
      setDisplayedTickets(filteredTickets);
      
      // Reset animation flag after animation duration
      setTimeout(() => {
        setShouldAnimate(false);
      }, 800); // Slightly longer than the animation duration to ensure it completes
    }
  }, [filters, allTickets]);

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

      setAllTickets(response.tickets);
      setShouldAnimate(true);
      
      // Reset animation flag after animation duration
      setTimeout(() => {
        setShouldAnimate(false);
      }, 800);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityOrder = (a: string, b: string): number => {
    const order: Record<string, number> = { low: 1, normal: 2, high: 3, urgent: 4 };
    return (order[a.toLowerCase()] || 0) - (order[b.toLowerCase()] || 0);
  };

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSort = (field: string) => {
    setFilters(prev => ({
      ...prev,
      sortField: field,
      sortDirection: prev.sortField === field && prev.sortDirection === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIndicator = (field: string) => {
    if (filters.sortField !== field) return '↕';
    return filters.sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleRowClick = (ticketId: string) => {
    navigate(`/tickets/${ticketId}`);
  };

  return (
    <div className="ticket-list-container">
      <div className="tickets-header">
        <div className="header-content">
          <h1>{isAgentOrAdmin ? 'Support Tickets' : 'My Tickets'}</h1>
          <p className="subtitle">
            {isAgentOrAdmin 
              ? 'View and manage support tickets' 
              : 'View and track your support requests'}
          </p>
        </div>
        <Link to="/tickets/new" className="create-ticket-button">
          Create New Ticket
        </Link>
      </div>

      <div className="filters">
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="filter-select"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="solved">Solved</option>
          <option value="closed">Closed</option>
        </select>

        {isAgentOrAdmin && (
          <select
            value={filters.priority}
            onChange={(e) => handleFilterChange('priority', e.target.value)}
            className="filter-select"
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        )}

        {isAgentOrAdmin && (
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
      </div>

      <div className="tickets-table-container">
        <table className="tickets-table">
          <thead>
            <tr>
              <th className="ticket-id sortable-header" onClick={() => handleSort('id')}>
                ID {getSortIndicator('id')}
              </th>
              <th className="status-cell sortable-header" onClick={() => handleSort('status')}>
                Status {getSortIndicator('status')}
              </th>
              <th className="priority-cell sortable-header" onClick={() => handleSort('priority')}>
                Priority {getSortIndicator('priority')}
              </th>
              <th className="subject-cell sortable-header" onClick={() => handleSort('subject')}>
                Subject {getSortIndicator('subject')}
              </th>
              <th className="topic-cell sortable-header" onClick={() => handleSort('topic')}>
                Topic {getSortIndicator('topic')}
              </th>
              <th className="group-cell sortable-header" onClick={() => handleSort('group_name')}>
                Group {getSortIndicator('group_name')}
              </th>
              <th className="assignee-cell sortable-header" onClick={() => handleSort('agent_name')}>
                Assigned To {getSortIndicator('agent_name')}
              </th>
            </tr>
          </thead>
          <tbody className={shouldAnimate ? 'initial-load' : loading ? 'loading' : ''}>
            {(() => {
              if (displayedTickets.length === 0 && !loading) {
                return (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      <div className="no-tickets">
                        <p>No tickets found</p>
                        <Link to="/tickets/new" className="create-ticket-button">
                          Create Your First Ticket
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              }
              return displayedTickets.map(ticket => (
                <tr 
                  key={ticket.id} 
                  onClick={() => handleRowClick(ticket.id)}
                  className="clickable-row"
                >
                  <td className="ticket-id">#{ticket.id}</td>
                  <td className="status-cell">
                    <span className={`status-badge ${ticket.status.toLowerCase()}`}>
                      {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="priority-cell">
                    <span className={`priority-badge ${ticket.priority.toLowerCase()}`}>
                      {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="subject-cell">{ticket.subject}</td>
                  <td className="topic-cell">{ticket.topic || 'None'}</td>
                  <td className="group-cell">{ticket.group_name || 'None'}</td>
                  <td className="assignee-cell">{ticket.agent_name || ticket.agent_email || 'Unassigned'}</td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
};

export default TicketList;