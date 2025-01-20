import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { 
  TicketStatus, 
  TicketPriority, 
  TicketType, 
  TicketTopic, 
  CustomerType,
  Ticket,
  Profile
} from '../types/supabase';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import Navigation from '../components/Navigation';
import '../styles/Dashboard.css';
import { getInitials, getProfileColor, formatFullName } from '../utils/profileUtils';
import { useDashboard } from '../contexts/DashboardContext';
import { ActivityFeedItem } from '../contexts/DashboardContext';

interface TicketSummary {
  status: string;
  count: number;
}

interface ArticleSummary {
  total: number;
  recent: number;
}

interface FormattedTicket {
  id: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  ticket_type: TicketType;
  topic: TicketTopic;
  customer_type: CustomerType;
  created_at: string;
  updated_at: string;
  group_id: string | null;
  user: { email: string };
  agent?: { email: string };
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
  const [tickets, setTickets] = useState<FormattedTicket[]>([]);
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

      const formattedTickets: FormattedTicket[] = (ticketData || []).map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        ticket_type: ticket.ticket_type,
        topic: ticket.topic,
        customer_type: ticket.customer_type,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        group_id: ticket.group_id,
        user: { email: ticket.creator_email || 'Unknown' },
        agent: ticket.agent_email ? { email: ticket.agent_email } : undefined
      }));

      setTickets(formattedTickets);
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
              {isAgent && <td>{ticket.user.email}</td>}
              <td>{ticket.agent?.email || 'Unassigned'}</td>
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
        <div className="activity-list">
          {stats.activityFeed.length === 0 ? (
            <div className="activity-empty">
              No recent activity
            </div>
          ) : (
            stats.activityFeed.map((activity: ActivityFeedItem, index: number) => (
              <div key={index} className="activity-item">
                <div className="activity-header">
                  <div className="activity-icon">
                    {activity.type === 'assigned' ? (
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="activity-title">
                    <strong>{activity.actor}</strong>{' '}
                    {activity.type === 'assigned' ? 'assigned' : 'increased the priority'} on{' '}
                    <Link to={`/tickets/${activity.ticketId}`} className="activity-link">
                      "{activity.ticketSubject}"
                    </Link>
                  </div>
                </div>
                <div className="activity-meta">
                  {formatDate(activity.timestamp)}
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
                  <select className="filter-select">
                    <option value="all">All</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
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
              <button className="play-button">
                Play
                <svg className="play-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          <div className="tickets-table-container">
            <table className="tickets-table">
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
                  <th>Status</th>
                  <th>ID</th>
                  <th>Subject</th>
                  <th>Requester</th>
                  <th>Requester updated</th>
                  <th>Group</th>
                  <th>Assignee</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket, index) => (
                  <tr key={ticket.id}>
                    <td className="checkbox-cell">
                      <div className="checkbox-wrapper">
                        <input 
                          type="checkbox"
                          checked={selectedTickets.has(ticket.id)}
                          onChange={(e) => handleSelectTicket(ticket.id, e.target.checked)}
                        />
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${ticket.status.toLowerCase()}`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="ticket-id">#{index + 1}</td>
                    <td className="subject-cell">
                      <Link to={`/tickets/${ticket.id}`} className="ticket-subject">
                        {ticket.subject}
                      </Link>
                    </td>
                    <td>{ticket.creator_email}</td>
                    <td>{formatDate(ticket.updated_at)}</td>
                    <td>Support</td>
                    <td>{ticket.agent_email || 'Unassigned'}</td>
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

export default Dashboard; 