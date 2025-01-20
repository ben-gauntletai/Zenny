import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDashboard } from '../contexts/DashboardContext';
import type { TicketWithUsers } from '../types/supabase';
import '../styles/Dashboard.css';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { stats, tickets, loading } = useDashboard();
  const userRole = user?.user_metadata?.role || 'user';

  if (loading) return <div>Loading dashboard...</div>;

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
          <span className="stat-value">
            {tickets.filter(t => t.assigned_to === user?.id).length}
          </span>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">Unassigned</h3>
          <span className="stat-value">
            {tickets.filter(t => !t.assigned_to).length}
          </span>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">Open Tickets</h3>
          <span className="stat-value">{stats.ticketStats.open}</span>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">In Progress</h3>
          <span className="stat-value">{stats.ticketStats.inProgress}</span>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">Resolved</h3>
          <span className="stat-value">{stats.ticketStats.resolved}</span>
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
              {tickets.slice(0, 5).map((ticket: TicketWithUsers) => (
                <tr key={ticket.id}>
                  <td>#{ticket.id}</td>
                  <td>
                    <Link to={`/tickets/${ticket.id}`} className="ticket-subject">
                      <span className={`priority-indicator priority-${ticket.priority}`} />
                      {ticket.subject}
                    </Link>
                  </td>
                  <td>{ticket.creator_email}</td>
                  <td>{new Date(ticket.updated_at).toLocaleDateString()}</td>
                  <td>Support</td>
                  <td>{ticket.agent_email || 'Unassigned'}</td>
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
