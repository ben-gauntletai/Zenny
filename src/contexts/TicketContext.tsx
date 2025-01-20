import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

interface Ticket {
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

interface Reply {
  id: number;
  ticket_id: number;
  content: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  is_public: boolean;
  user_email: string;
}

interface TicketContextType {
  ticket: Ticket | null;
  replies: Reply[];
  loading: boolean;
  error: string | null;
  addReply: (content: string, isPublic: boolean) => Promise<void>;
  updateTicket: (updates: Partial<Ticket>) => Promise<void>;
}

const TicketContext = createContext<TicketContextType | undefined>(undefined);

export const TicketProvider: React.FC<{ children: React.ReactNode; ticketId: string }> = ({ children, ticketId }) => {
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTicket = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

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
  }, [ticketId]);

  const addReply = async (content: string, isPublic: boolean) => {
    if (!user?.id || !ticket) return;

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

      setReplies(prev => [...prev, data]);

      // Update ticket updated_at timestamp
      await supabase
        .from('tickets')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', ticket.id);

    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateTicket = async (updates: Partial<Ticket>) => {
    if (!ticket) return;

    try {
      const { data, error } = await supabase
        .from('tickets')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', ticket.id)
        .select()
        .single();

      if (error) throw error;

      setTicket(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (ticketId) {
      fetchTicket();
    }
  }, [ticketId, fetchTicket]);

  return (
    <TicketContext.Provider value={{
      ticket,
      replies,
      loading,
      error,
      addReply,
      updateTicket
    }}>
      {children}
    </TicketContext.Provider>
  );
};

export const useTicket = () => {
  const context = useContext(TicketContext);
  if (context === undefined) {
    throw new Error('useTicket must be used within a TicketProvider');
  }
  return context;
}; 