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
  tags: string[];
  profiles?: { 
    email: string;
    full_name?: string | null;
  };
  agents?: { 
    email: string;
    full_name?: string | null;
  };
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
          profiles:user_id(email, full_name),
          agents:assigned_to(email, full_name)
        `)
        .eq('id', ticketId)
        .single();

      if (ticketError) throw ticketError;

      // Parse the tags from JSONB to array
      const parsedTicket = {
        ...ticketData,
        tags: Array.isArray(ticketData.tags) ? ticketData.tags : JSON.parse(ticketData.tags || '[]')
      };

      const { data: repliesData, error: repliesError } = await supabase
        .from('replies')
        .select('*, user_email:profiles(email)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (repliesError) throw repliesError;

      setTicket(parsedTicket);
      setReplies(repliesData || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const addReply = async (content: string, isPublic = true): Promise<Reply> => {
    if (!user) throw new Error('User not authenticated');
    if (!ticket) throw new Error('No ticket loaded');

    const { data, error } = await supabase
      .from('replies')
      .insert({
        ticket_id: ticket.id,
        content,
        user_id: user.id,
        is_public: isPublic
      })
      .select('*, user_email:profiles(email)')
      .single();

    if (error) throw error;

    setReplies(prev => [...prev, data]);
    return data;
  };

  const updateTicket = async (updates: Partial<Ticket>) => {
    if (!ticket) throw new Error('No ticket loaded');

    try {
      console.log('Updating ticket with:', updates);
      // Convert tags array to JSONB format if it exists in updates
      const formattedUpdates = {
        ...updates,
        tags: updates.tags ? JSON.stringify(updates.tags) : undefined
      };

      const { data, error } = await supabase
        .from('tickets')
        .update(formattedUpdates)
        .eq('id', ticket.id)
        .select(`
          *,
          profiles:user_id(email, full_name),
          agents:assigned_to(email, full_name)
        `)
        .single();

      if (error) {
        console.error('Error updating ticket:', error);
        throw error;
      }

      // Parse the tags back from JSONB to array
      const parsedTicket = {
        ...data,
        tags: Array.isArray(data.tags) ? data.tags : JSON.parse(data.tags || '[]')
      };

      console.log('Ticket updated successfully:', parsedTicket);
      setTicket(parsedTicket);
      return parsedTicket;
    } catch (err) {
      console.error('Failed to update ticket:', err);
      throw err;
    }
  };

  return {
    ticket,
    replies,
    loading,
    error,
    addReply,
    updateTicket
  };
};