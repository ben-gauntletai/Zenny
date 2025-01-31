import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  topic?: string;
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
  const [sortField, setSortField] = useState<string>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (field: string) => {
    if (sortField !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const handleRowClick = (ticketId: number, event: React.MouseEvent) => {
    navigate(`/tickets/${ticketId}`);
  };

  // Sort tickets based on current sort field and direction
  const sortedTickets = [...tickets].sort((a, b) => {
    const aValue = a[sortField as keyof TicketWithUsers];
    const bValue = b[sortField as keyof TicketWithUsers];
    
    if (aValue === bValue) return 0;
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    
    const comparison = aValue < bValue ? -1 : 1;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="ticket-list-container">
      <div className="ticket-list-header">
        <h2>Support Tickets</h2>
        <Link to="/tickets/new" className="create-ticket-button">
          Create New Ticket
        </Link>
      </div>

      <div className="filters">
        <div className="filter-item">
          <span>Priority: </span>
          <select 
            className="filter-select"
            value={filters.priority}
            onChange={(e) => handleFilterChange('priority', e.target.value)}
          >
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        {isAgent && (
          <div className="filter-item">
            <span>Assignee: </span>
            <select
              className="filter-select"
              value={filters.assignee}
              onChange={(e) => handleFilterChange('assignee', e.target.value)}
            >
              <option value="">All</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
        )}
        <div className="filter-item">
          <span>Status: </span>
          <select
            className="filter-select"
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="solved">Solved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="tickets-table-container">
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
          <table className="tickets-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('id')} className="sortable-header">
                  ID {getSortIndicator('id')}
                </th>
                <th onClick={() => handleSort('status')} className="sortable-header">
                  Status {getSortIndicator('status')}
                </th>
                <th onClick={() => handleSort('priority')} className="sortable-header">
                  Priority {getSortIndicator('priority')}
                </th>
                <th onClick={() => handleSort('subject')} className="sortable-header">
                  Subject {getSortIndicator('subject')}
                </th>
                <th onClick={() => handleSort('topic')} className="sortable-header">
                  Topic {getSortIndicator('topic')}
                </th>
                <th onClick={() => handleSort('group_name')} className="sortable-header">
                  Group {getSortIndicator('group_name')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((ticket) => (
                <tr 
                  key={ticket.id}
                  onClick={(e) => handleRowClick(ticket.id, e)}
                  className="clickable-row"
                >
                  <td className="ticket-id">#{ticket.id}</td>
                  <td>
                    <span className={`status-badge ${ticket.status.toLowerCase()}`}>
                      {capitalizeFirstLetter(ticket.status)}
                    </span>
                  </td>
                  <td>
                    <span className={`priority-badge ${ticket.priority.toLowerCase()}`}>
                      {capitalizeFirstLetter(ticket.priority)}
                    </span>
                  </td>
                  <td className="subject-cell">
                    {ticket.subject}
                  </td>
                  <td>{ticket.topic || 'None'}</td>
                  <td>{ticket.group_name || 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TicketList; 
