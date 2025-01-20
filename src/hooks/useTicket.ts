import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export interface Reply {
  id: number;
  ticket_id: number;
  content: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  is_public: boolean;
  user_email: string;
}

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved';
  priority: 'low' | 'normal' | 'high';
  created_at: string;
  updated_at: string;
  user_id: string;
  assigned_to?: string;
  profiles?: { email: string };
  agents?: { email: string };
}

export const useTicket = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ticketId) {
      fetchTicket();
    }
  }, [ticketId]);

  const fetchTicket = async () => {
    try {
      setLoading(true);
      setError('');

      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          profiles!tickets_user_id_fkey(email),
          agents:profiles!tickets_assigned_to_fkey(email)
        `)
        .eq('id', ticketId)
        .single();

      if (ticketError) throw ticketError;

      const { data: repliesData, error: repliesError } = await supabase
        .from('replies_with_users')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (repliesError) throw repliesError;

      setTicket(ticketData);
      setReplies(repliesData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addReply = async (content: string, isPublic = true): Promise<Reply> => {
    if (!user?.id || !ticket) {
      throw new Error('User must be logged in and ticket must exist to add a reply');
    }

    try {
      const { data, error } = await supabase
        .from('replies')
        .insert([
          {
            ticket_id: ticket.id,
            content,
            user_id: user.id,
            is_public: isPublic
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Update ticket updated_at timestamp
      await supabase
        .from('tickets')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', ticket.id);

      // Refresh replies
      const { data: repliesData, error: repliesError } = await supabase
        .from('replies_with_users')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: true });

      if (repliesError) throw repliesError;
      setReplies(repliesData || []);

      return data;
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  return {
    ticket,
    replies,
    loading,
    error,
    addReply
  };
};