import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDashboard } from '../contexts/DashboardContext';
import { Ticket } from '../contexts/DashboardContext';
import '../styles/Dashboard.css';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { stats, tickets, loading } = useDashboard();
  const userRole = user?.user_metadata?.role || 'user';

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div className="dashboard">
      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-card">
            <h3 className="stat-title">Total Tickets</h3>
            <span className="stat-value">{stats.ticketStats.total}</span>
          </div>
          <div className="stat-card">
            <h3 className="stat-title">Open Tickets</h3>
            <span className="stat-value">{stats.ticketStats.open}</span>
          </div>
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
        </div>
      </div>

      <div className="recent-tickets">
        <div className="section-header">
          <h2>Recent Tickets</h2>
          <Link to="/tickets" className="view-all">View All</Link>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>Created By</th>
                <th>Updated</th>
                <th>Group</th>
                <th>Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {tickets.slice(0, 5).map((ticket: Ticket) => (
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
                  <td>{ticket.group_name}</td>
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
