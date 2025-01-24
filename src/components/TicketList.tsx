import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { TicketWithUsers } from '../types/supabase';
import TicketCard from '../components/TicketCard';
import '../styles/TicketList.css';
import '../styles/TicketCard.css';

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
  
  const { user } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';

  useEffect(() => {
    fetchTickets();
  }, [filters]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('tickets_with_users')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (!isAgent) {
        query = query.eq('user_id', user?.id);
      } else if (filters.assignee === 'me') {
        query = query.eq('assigned_to', user?.id);
      } else if (filters.assignee === 'unassigned') {
        query = query.is('assigned_to', null);
      }

      const { data, error: fetchError } = await query;
      
      if (fetchError) throw fetchError;
      setTickets(data || []);
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

  return (
    <div className="ticket-list-container">
      <div className="ticket-list-header">
        <h2>Support Tickets</h2>
        <Link to="/tickets/new" className="create-ticket-button">
          Create New Ticket
        </Link>
      </div>

      <div className="tickets-scroll-container">
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
          <div className="ticket-list">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketList; 
