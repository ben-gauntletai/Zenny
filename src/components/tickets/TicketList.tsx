import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Ticket } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

const TicketList: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const userRole = user?.user_metadata?.role || 'user';
      
      let query = supabase
        .from('tickets')
        .select(`
          *,
          users!tickets_user_id_fkey (email)
        `)
        .order('created_at', { ascending: false });

      // If user is not an agent/admin, only show their tickets
      if (userRole === 'user') {
        query = query.eq('user_id', user?.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTickets(data || []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading tickets...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="ticket-list">
      <div className="ticket-list-header">
        <h2>Support Tickets</h2>
        <Link to="/tickets/new" className="create-ticket-button">
          Create New Ticket
        </Link>
      </div>
      <div className="ticket-filters">
        {/* Add filters here later */}
      </div>
      <div className="tickets">
        {tickets.length === 0 ? (
          <div className="no-tickets">No tickets found</div>
        ) : (
          tickets.map((ticket) => (
            <div key={ticket.id} className="ticket-card">
              <div className="ticket-header">
                <h3>
                  <Link to={`/tickets/${ticket.id}`}>{ticket.title}</Link>
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
                  {new Date(ticket.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="ticket-description">{ticket.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TicketList; 
