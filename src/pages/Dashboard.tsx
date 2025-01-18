import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Ticket as SupabaseTicket, Profile } from '../lib/supabaseClient';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Dashboard.css';

interface TicketSummary {
  status: string;
  count: number;
}

interface ArticleSummary {
  total: number;
  recent: number;
}

interface FormattedTicket extends Omit<SupabaseTicket, 'user_id' | 'assigned_to'> {
  user: { email: string };
  agent?: { email: string };
}

interface UserMapProfile {
  id: string;
  email: string;
}

const ALL_STATUSES = ['NEW', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';
  const [ticketSummary, setTicketSummary] = useState<TicketSummary[]>([]);
  const [articleSummary, setArticleSummary] = useState<ArticleSummary>({ total: 0, recent: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.id) {
      fetchSummaryData();
    }
  }, [user?.id]);

  const fetchSummaryData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Fetch ticket summary
      let query = supabase
        .from('tickets')
        .select('status');

      if (!isAgent) {
        query = query.eq('user_id', user?.id);
      }

      const { data: ticketData, error: ticketError } = await query;

      if (ticketError) {
        console.error('Ticket summary query error:', ticketError);
        throw ticketError;
      }

      // Initialize counts for all statuses
      const summary = ALL_STATUSES.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
      }, {} as Record<string, number>);

      // Update counts from actual data
      ticketData?.forEach((ticket: { status: string }) => {
        if (ticket.status in summary) {
          summary[ticket.status] = (summary[ticket.status] || 0) + 1;
        }
      });

      const ticketSummaryData = Object.entries(summary).map(([status, count]) => ({
        status,
        count
      }));

      // Fetch article summary
      const { data: articleData, error: articleError } = await supabase
        .from('knowledge_base_articles')
        .select('created_at');

      if (articleError) {
        console.error('Article summary query error:', articleError);
        throw articleError;
      }

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const articleSummaryData = {
        total: articleData?.length || 0,
        recent: articleData?.filter((article: { created_at: string }) => 
          new Date(article.created_at) > oneWeekAgo
        ).length || 0
      };

      setTicketSummary(ticketSummaryData);
      setArticleSummary(articleSummaryData);
    } catch (err) {
      console.error('Error fetching summary data:', err);
      setError('Failed to load dashboard data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard loading">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard error">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={fetchSummaryData} className="dashboard-button primary-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Welcome back, {user?.user_metadata?.name || user?.email || 'User'}</h1>
        <p className="dashboard-subtitle">Here's an overview of your support activity</p>
      </header>

      <section className="dashboard-grid">
        <div className="dashboard-card">
          <h2 className="stat-title">Your Tickets</h2>
          <div className="stat-grid">
            {ticketSummary.map(({ status, count }) => (
              <div key={status} className="stat-item">
                <span className="stat-label">{status.replace('_', ' ')}</span>
                <span className="stat-value">{count}</span>
              </div>
            ))}
          </div>
          <Link to="/tickets" className="dashboard-button primary-button">
            View All Tickets
          </Link>
        </div>

        <div className="dashboard-card">
          <h2 className="stat-title">Knowledge Base</h2>
          <div className="stat-grid">
            <div className="stat-item">
              <span className="stat-label">Total Articles</span>
              <span className="stat-value">{articleSummary.total}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">New This Week</span>
              <span className="stat-value">{articleSummary.recent}</span>
            </div>
          </div>
          <Link to="/knowledge-base" className="dashboard-button secondary-button">
            Browse Articles
          </Link>
        </div>
      </section>

      <section className="recent-tickets">
        <div className="section-header">
          <h2>Recent Tickets</h2>
          <Link to="/tickets/new" className="dashboard-button primary-button">
            Create Ticket
          </Link>
        </div>
        <RecentTickets userId={user?.id} isAgent={isAgent} />
      </section>
    </div>
  );
};

interface RecentTicketsProps {
  userId: string | undefined;
  isAgent: boolean;
}

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
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!isAgent) {
        query.eq('user_id', userId);
      }

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
      console.error('Error fetching recent tickets:', err);
      setError('Failed to load recent tickets');
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

export default Dashboard; 