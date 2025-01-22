import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { 
  TicketStatus, 
  TicketPriority, 
  TicketType, 
  TicketTopic, 
  CustomerType,
  Profile
} from '../types/supabase';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import Navigation from '../components/Navigation';
import '../styles/Dashboard.css';
import { getInitials, getProfileColor, formatFullName } from '../utils/profileUtils';
import { useDashboard } from '../contexts/DashboardContext';
import { ActivityFeedItem, Ticket } from '../contexts/DashboardContext';

interface TicketSummary {
  status: string;
  count: number;
}

interface ArticleSummary {
  total: number;
  recent: number;
}

interface UserMapProfile {
  id: string;
  email: string;
}

interface RecentTicketsProps {
  userId: string | undefined;
  isAgent: boolean;
}

const ALL_STATUSES = ['open', 'pending', 'solved', 'closed'];

const RecentTickets: React.FC<RecentTicketsProps> = ({ userId, isAgent }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (userId) {
      fetchRecentTickets();
    }
  }, [userId, isAgent]);

  const fetchRecentTickets = async () => {
    try {
      setLoading(true);
      setError('');

      const query = supabase
        .from('tickets_with_users')
        .select(`
          id,
          subject,
          description,
          status,
          priority,
          ticket_type,
          topic,
          customer_type,
          created_at,
          updated_at,
          user_id,
          assigned_to,
          group_id,
          creator_email,
          creator_name,
          agent_email,
          agent_name
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!isAgent) {
        query.eq('user_id', userId);
      }

      const { data: ticketData, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setTickets(ticketData || []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString([], { 
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  if (loading) {
    return (
      <div className="tickets-loading">
        <div className="loading-spinner"></div>
        <p>Loading recent tickets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tickets-error">
        <p>{error}</p>
        <button onClick={fetchRecentTickets} className="dashboard-button primary-button">
          Retry
        </button>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="no-tickets">
        <p>No recent tickets found</p>
        <Link to="/tickets/new" className="dashboard-button primary-button">
          Create Your First Ticket
        </Link>
      </div>
    );
  }

  return (
    <div className="tickets-table-container">
      <table className="tickets-table">
        <thead>
          <tr>
            <th>Subject</th>
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
                  {ticket.status.replace('_', ' ')}
                </span>
              </td>
              <td>
                <span className={`priority-badge ${ticket.priority.toLowerCase()}`}>
                  {ticket.priority}
                </span>
              </td>
              <td>{formatDate(ticket.created_at)}</td>
              {isAgent && <td>{ticket.creator_email}</td>}
              <td>{ticket.agent_name || ticket.agent_email || 'Unassigned'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';
  const [selectedTickets, setSelectedTickets] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const { stats, tickets, loading: dashboardLoading } = useDashboard();
  const userRole = user?.user_metadata?.role || 'user';
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const navigate = useNavigate();
  const initialLoadComplete = useRef(false);

  useEffect(() => {
    if (!dashboardLoading && tickets.length > 0 && !initialLoadComplete.current) {
      initialLoadComplete.current = true;
    }
  }, [dashboardLoading, tickets]);

  const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  useEffect(() => {
    console.log('Dashboard mounted with:', { stats, tickets, dashboardLoading });
  }, [stats, tickets, dashboardLoading]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTickets(new Set(tickets.map(ticket => ticket.id)));
    } else {
      setSelectedTickets(new Set());
    }
  };

  const handleSelectTicket = (ticketId: number, checked: boolean) => {
    const newSelected = new Set(selectedTickets);
    if (checked) {
      newSelected.add(ticketId);
    } else {
      newSelected.delete(ticketId);
    }
    setSelectedTickets(newSelected);
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

  const getPriorityOrder = (priority: string): number => {
    switch (priority.toLowerCase()) {
      case 'low': return 1;
      case 'normal': return 2;
      case 'high': return 3;
      case 'urgent': return 4;
      default: return 0;
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (priorityFilter === 'all') return true;
    return ticket.priority.toLowerCase() === priorityFilter;
  });

  const sortedAndFilteredTickets = filteredTickets.sort((a, b) => {
    if (!sortField) return 0;
    
    const direction = sortDirection === 'asc' ? 1 : -1;
    
    switch (sortField) {
      case 'id':
        return (a.id - b.id) * direction;
      case 'status':
        return a.status.localeCompare(b.status) * direction;
      case 'priority':
        return (getPriorityOrder(a.priority) - getPriorityOrder(b.priority)) * direction;
      case 'subject':
        return a.subject.localeCompare(b.subject) * direction;
      case 'requester':
        return a.creator_email.localeCompare(b.creator_email) * direction;
      case 'updated':
        return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * direction;
      case 'group':
        return ('Support').localeCompare('Support') * direction;
      case 'assignee':
        const aAssignee = a.agent_name || a.agent_email || 'Unassigned';
        const bAssignee = b.agent_name || b.agent_email || 'Unassigned';
        return aAssignee.localeCompare(bAssignee) * direction;
      default:
        return 0;
    }
  });

  const handleRowClick = (ticketId: number, event: React.MouseEvent) => {
    // Prevent navigation if clicking checkbox cell
    if ((event.target as HTMLElement).closest('.checkbox-cell')) {
      return;
    }
    navigate(`/tickets/${ticketId}`);
  };

  if (error) {
    return (
      <div className="dashboard error">
        <div className="error-message">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <Navigation />
      <div className="activity-feed">
        <div className="activity-feed-header">
          Updates to your tickets
        </div>
        <div className="interaction-list">
          {stats.activityFeed.length === 0 ? (
            <div className="activity-empty">
              No recent activity
            </div>
          ) : (
            stats.activityFeed.map((activity: ActivityFeedItem) => (
              <div key={activity.id} className="interaction-item">
                <div className="interaction-icon">
                  <i className={getInteractionIcon(activity.type)}></i>
                </div>
                <div className="interaction-content">
                  <div className="interaction-title">
                    {activity.title}
                  </div>
                  <div className="interaction-meta">
                    {activity.actor} • {new Date(activity.timestamp).toLocaleString()}
                  </div>
                  <div className="interaction-details">
                    <div className="change-item">
                      {activity.message}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="dashboard-content">
        <div className="dashboard-breadcrumb">
          <span>Dashboard</span>
        </div>
        
        <div className="stats-wrapper">
          <section className="dashboard-stats">
            <div className="stats-section">
              <h2>Open Tickets (current)</h2>
              <div className="stats-grid">
                <div className="stat-box">
                  <span className="stat-value">{stats.ticketStats.open}</span>
                  <span className="stat-label">YOU</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{stats.ticketStats.total}</span>
                  <span className="stat-label">GROUPS</span>
                </div>
              </div>
            </div>

            <div className="stats-section">
              <h2>Ticket Statistics (this week)</h2>
              <div className="stats-grid">
                <div className="stat-box">
                  <span className="stat-value">{stats.ticketStats.total}</span>
                  <span className="stat-label">Total</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{stats.ticketStats.open}</span>
                  <span className="stat-label">Open</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{stats.ticketStats.inProgress}</span>
                  <span className="stat-label">In Progress</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{stats.ticketStats.resolved}</span>
                  <span className="stat-label">Resolved</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="tickets-section">
          <div className="section-header">
            <div className="header-left">
              <h2>
                Tickets requiring your attention ({tickets.length})
              </h2>
              <div className="ticket-filters">
                <div className="filter-item">
                  <span>Priority: </span>
                  <select 
                    className="filter-select"
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="filter-divider" />
                <div className="bulk-actions" style={{ display: 'none' }}>
                  <button className="bulk-action-button">Assign to...</button>
                  <button className="bulk-action-button">Change priority...</button>
                  <button className="bulk-action-button">Solve</button>
                </div>
              </div>
            </div>
            <div className="header-right">
            </div>
          </div>
          <div className="tickets-table-container">
            <table className={`tickets-table ${!initialLoadComplete.current ? 'initial-load' : ''}`}>
              <thead>
                <tr>
                  <th className="checkbox-header">
                    <div className="checkbox-wrapper">
                      <input 
                        type="checkbox" 
                        checked={tickets.length > 0 && selectedTickets.size === tickets.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </div>
                  </th>
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
                  <th onClick={() => handleSort('requester')} className="sortable-header">
                    Requester {getSortIndicator('requester')}
                  </th>
                  <th onClick={() => handleSort('updated')} className="sortable-header">
                    Requester updated {getSortIndicator('updated')}
                  </th>
                  <th onClick={() => handleSort('group')} className="sortable-header">
                    Group {getSortIndicator('group')}
                  </th>
                  <th onClick={() => handleSort('assignee')} className="sortable-header">
                    Assignee {getSortIndicator('assignee')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredTickets.map((ticket, index) => (
                  <tr 
                    key={ticket.id}
                    onClick={(e) => handleRowClick(ticket.id, e)}
                    className="clickable-row"
                  >
                    <td className="checkbox-cell">
                      <div className="checkbox-wrapper">
                        <input 
                          type="checkbox"
                          checked={selectedTickets.has(ticket.id)}
                          onChange={(e) => handleSelectTicket(ticket.id, e.target.checked)}
                        />
                      </div>
                    </td>
                    <td className="ticket-id">#{ticket.id}</td>
                    <td>
                      <span className={`status-badge ${ticket.status.toLowerCase()}`}>
                        {capitalizeFirstLetter(ticket.status.replace('_', ' '))}
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
                    <td>{ticket.creator_email}</td>
                    <td>{formatDate(ticket.updated_at)}</td>
                    <td>Support</td>
                    <td>{ticket.agent_name || ticket.agent_email || 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

function getInteractionIcon(type: string) {
  switch (type) {
    case 'TICKET_CREATED':
      return 'fas fa-plus-circle';
    case 'TICKET_UPDATED':
      return 'fas fa-edit';
    case 'TICKET_ASSIGNED':
      return 'fas fa-user-plus';
    case 'COMMENT_ADDED':
      return 'fas fa-comment';
    default:
      return 'fas fa-info-circle';
  }
}

export default Dashboard; 