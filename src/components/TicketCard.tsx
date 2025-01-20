import React from 'react';
import { Link } from 'react-router-dom';
import { TicketWithUsers } from '../types/supabase';

interface TicketCardProps {
  ticket: TicketWithUsers;
}

const TicketCard: React.FC<TicketCardProps> = ({ ticket }) => {
  return (
    <div className="ticket-card">
      <div className="ticket-header">
        <Link to={`/tickets/${ticket.id}`} className="ticket-title">
          {ticket.subject}
        </Link>
        <div className="ticket-badges">
          <span className={`status-badge status-${ticket.status}`}>
            {ticket.status}
          </span>
          <span className={`priority-badge priority-${ticket.priority}`}>
            {ticket.priority}
          </span>
        </div>
      </div>
      
      <div className="ticket-meta">
        <div className="ticket-info">
          <span className="ticket-id">#{ticket.id}</span>
          <span className="ticket-type">{ticket.ticket_type}</span>
        </div>
        <div className="ticket-users">
          <span className="ticket-requester" title="Requester">
            {ticket.creator_email}
          </span>
          <span className="ticket-assignee" title="Assignee">
            {ticket.agent_email || 'Unassigned'}
          </span>
        </div>
        <div className="ticket-date">
          {new Date(ticket.created_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};

export default TicketCard; 