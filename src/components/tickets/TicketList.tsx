import React from 'react';
import { Link } from 'react-router-dom';
import type { Ticket } from '../../lib/supabaseClient';

interface TicketListProps {
  tickets: Ticket[];
}

const TicketList: React.FC<TicketListProps> = ({ tickets }) => {
  return (
    <div className="ticket-list">
      {tickets.map(ticket => (
        <div key={ticket.id} className="ticket-card">
          <div className="ticket-header">
            <h3>
              <Link to={`/tickets/${ticket.id}`}>{ticket.subject}</Link>
            </h3>
            <span className={`status status-${ticket.status}`}>
              {ticket.status}
            </span>
          </div>
          <div className="ticket-meta">
            <span className={`priority priority-${ticket.priority}`}>
              {ticket.priority}
            </span>
            <span className="created-at">
              Created: {new Date(ticket.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TicketList; 
