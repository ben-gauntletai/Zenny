import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Dashboard.css';

interface TicketStats {
  you: number;
  groups: number;
  good: number;
  bad: number;
  solved: number;
}

interface Ticket {
  id: string;
  title: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  user_id: string;
  users: {
    email: string;
  };
  assigned_to?: string;
  assigned_user?: {
    email: string;
  };
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<TicketStats>({
    you: 0,
    groups: 0,
    good: 0,
    bad: 0,
    solved: 0
  });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const userRole = user?.user_metadata?.role || 'user';

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch tickets
      let query = supabase
        .from('tickets')
        .select(`
          *,
          users!tickets_user_id_fkey (email),
          assigned_user:users!tickets_assigned_to_fkey (email)
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      if (userRole === 'user') {
        query = query.eq('user_id', user?.id);
      }

      const { data: ticketData, error: ticketError } = await query;
      if (ticketError) throw ticketError;

      // Calculate stats
      const assignedToYou = ticketData?.filter(t => t.assigned_to === user?.id).length || 0;
      const groupTickets = ticketData?.filter(t => !t.assigned_to).length || 0;
      const goodRating = 0; // To be implemented with feedback system
      const badRating = 0; // To be implemented with feedback system
      const solvedTickets = ticketData?.filter(t => t.status === 'closed').length || 0;

      setTickets(ticketData || []);
      setStats({
        you: assignedToYou,
        groups: groupTickets,
        good: goodRating,
        bad: badRating,
        solved: solvedTickets
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading dashboard...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2 className="dashboard-title">Dashboard</h2>
        <p className="dashboard-subtitle">View and manage your support tickets</p>
        <div className="dashboard-actions">
          <Link to="/tickets/new" className="dashboard-button primary-button">
            Create New Ticket
          </Link>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3 className="stat-title">Assigned to You</h3>
          <span className="stat-value">{stats.you}</span>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">Unassigned</h3>
          <span className="stat-value">{stats.groups}</span>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">Positive Feedback</h3>
          <span className="stat-value">{stats.good}</span>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">Negative Feedback</h3>
          <span className="stat-value">{stats.bad}</span>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">Solved Tickets</h3>
          <span className="stat-value">{stats.solved}</span>
        </div>
      </div>

      <div className="recent-tickets">
        <div className="recent-tickets-header">
          <h3 className="recent-tickets-title">Recent Tickets</h3>
          <Link to="/tickets" className="view-all-link">
            View all tickets
          </Link>
        </div>
        <div className="tickets-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>Requester</th>
                <th>Updated</th>
                <th>Group</th>
                <th>Assignee</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => (
                <tr key={ticket.id}>
                  <td>#{ticket.id.slice(0, 8)}</td>
                  <td>
                    <Link to={`/tickets/${ticket.id}`} className="ticket-subject">
                      <span className={`priority-indicator priority-${ticket.priority}`} />
                      {ticket.title}
                    </Link>
                  </td>
                  <td>{ticket.users.email}</td>
                  <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                  <td>Support</td>
                  <td>{ticket.assigned_user?.email || 'Unassigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 
