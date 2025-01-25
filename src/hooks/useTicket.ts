import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const EDGE_FUNCTION_URL = process.env.REACT_APP_SUPABASE_URL + '/functions/v1/tickets';

export interface Reply {
  id: number;
  content: string;
  created_at: string;
  user_id: string;
  user_email: string | { email: string };
  user_profile?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    role: string;
  };
  type?: 'reply';
  ticket_id: number;
  is_internal: boolean;
}

export interface Ticket {
  id: number;
  user_id: string;
  subject: string;
  description: string;
  status: 'open' | 'pending' | 'solved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  ticket_type: 'question' | 'incident' | 'problem' | 'task';
  topic: 'Order & Shipping Issues' | 'Billing & Account Concerns' | 'Communication & Customer Experience' | 'Policy, Promotions & Loyalty Programs' | 'Product & Service Usage' | null;
  created_at: string;
  updated_at: string;
  assigned_to?: string;
  tags?: string[];
  isNewTicket?: boolean;
  group_name?: string;
  profiles?: { 
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
    role?: 'user' | 'agent' | 'admin';
  };
  agents?: { 
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
    role?: 'user' | 'agent' | 'admin';
  };
}

// Add these types at the top of the file after the existing types
type RealtimePayload = {
  type: 'NEW_REPLY';
  replyId: number;
  ticketId: number;
};

type SubscriptionStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT';

// Add new type for system messages
type SystemMessage = {
  id: number;
  type: 'system';
  content: string;
  created_at: string;
};

// Combined message type
type Message = Reply | SystemMessage;

export const useTicket = (ticketId: string) => {
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (ticketId) {
      fetchTicket();

      console.log('Setting up real-time subscription for ticket:', ticketId);

      // Create a channel with the correct format
      const channel = supabase.channel('any').on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'replies',
          filter: `ticket_id=eq.${ticketId}`
        },
        handleNewReply
      ).on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${ticketId}`
        },
        (payload: { new: Ticket }) => {
          console.log('🔄 Realtime update received:', payload.new);
          // Parse the tags back from JSONB to array if needed
          setTicket(current => {
            const updatedTicket = {
              ...payload.new,
              tags: Array.isArray(payload.new.tags) ? payload.new.tags : JSON.parse(payload.new.tags || '[]')
            };
            console.log('🔄 Setting ticket state to:', updatedTicket);
            return updatedTicket;
          });
        }
      );

      // Store channel in ref for cleanup
      channelRef.current = channel;

      // Subscribe and handle connection status
      channel.subscribe((status) => {
        console.log(`Subscription status:`, status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to changes for ticket:', ticketId);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Channel error for ticket:', ticketId);
          // Try to resubscribe after a delay
          setTimeout(() => {
            console.log('Attempting to resubscribe...');
            if (channelRef.current) {
              channelRef.current.subscribe();
            }
          }, 2000);
        } else if (status === 'TIMED_OUT') {
          console.error('Subscription timed out for ticket:', ticketId);
          // Try to resubscribe after a delay
          setTimeout(() => {
            console.log('Attempting to resubscribe after timeout...');
            if (channelRef.current) {
              channelRef.current.subscribe();
            }
          }, 2000);
        }
      });

      return () => {
        console.log('Cleaning up subscription');
        if (channelRef.current) {
          channelRef.current.unsubscribe();
          channelRef.current = null;
        }
      };
    }
  }, [ticketId]); // Remove ticket from dependencies to prevent subscription loop

  const handleNewReply = async (payload: any) => {
    console.log('Received new reply from Postgres:', payload.new);
    
    try {
      // Prevent duplicate processing
      const isDuplicate = messages.some(msg => 
        'id' in msg && msg.id === payload.new.id
      );
      
      if (isDuplicate) {
        console.log('Skipping duplicate reply:', payload.new.id);
        return;
      }

      // Fetch the complete reply with user profile
      const { data: newReply, error: replyError } = await supabase
        .from('replies')
        .select(`
          *,
          user_profile:profiles!replies_user_id_fkey (
            email,
            full_name,
            avatar_url,
            role
          )
        `)
        .eq('id', payload.new.id)
        .single();

      if (replyError) {
        console.error('Error fetching new reply:', replyError);
        return;
      }

      if (newReply) {
        console.log('New reply data structure:', newReply);
        
        // Check if the user should see this reply
        const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';
        const isOwnReply = newReply.user_id === user?.id;
        const isPublicReply = newReply.is_public;
        
        // Only show the reply if:
        // 1. User is an agent/admin (they see all replies)
        // 2. It's the user's own reply
        // 3. It's a public reply
        if (isAgentOrAdmin || isOwnReply || isPublicReply) {
          // Format the reply to match our Reply type
          const formattedReply: Reply = {
            id: newReply.id,
            type: 'reply' as const,
            ticket_id: newReply.ticket_id,
            content: newReply.content,
            created_at: newReply.created_at,
            user_id: newReply.user_id,
            user_email: newReply.user_profile?.email || '',
            is_internal: !newReply.is_public,
            user_profile: {
              full_name: newReply.user_profile?.full_name || null,
              email: newReply.user_profile?.email || '',
              avatar_url: newReply.user_profile?.avatar_url || null,
              role: newReply.user_profile?.role || ''
            }
          };

          console.log('Formatted reply:', formattedReply);

          setMessages(current => {
            // Double check for duplicates (race condition protection)
            if (current.some(msg => 'id' in msg && msg.id === formattedReply.id)) {
              console.log('Reply already exists in state (race condition), skipping');
              return current;
            }
            
            // Sort messages by creation date to maintain order
            const newMessages = [...current, formattedReply].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            
            console.log('Updated messages:', {
              previousCount: current.length,
              newCount: newMessages.length
            });
            
            return newMessages;
          });
        } else {
          console.log('Skipping reply - user does not have permission to view it');
        }
      }
    } catch (err) {
      console.error('Error processing new reply:', err);
    }
  };

  const fetchTicket = async () => {
    try {
      setLoading(true);
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const response = await fetch(`${EDGE_FUNCTION_URL}/${ticketId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ticket: ${response.status}`);
      }

      const data = await response.json();
      const parsedTicket = {
        ...data.ticket,
        tags: Array.isArray(data.ticket.tags) ? data.ticket.tags : JSON.parse(data.ticket.tags || '[]')
      };

      setTicket(parsedTicket);
      
      // Convert replies to messages
      let initialMessages: Message[] = data.replies.map((reply: any) => ({
        ...reply,
        type: 'reply' as const,
        user_profile: reply.user_profile,
        user_email: reply.user_email
      }));

      setMessages(initialMessages);
    } catch (err) {
      console.error('Error fetching ticket:', err);
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  };

  const addReply = async (content: string, isPublic = true): Promise<Reply> => {
    if (!user) throw new Error('User not authenticated');
    if (!ticket) throw new Error('No ticket loaded');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    console.log('Adding new reply:', { content, isPublic, ticketId: ticket.id });

    const response = await fetch(`${EDGE_FUNCTION_URL}/${ticket.id}/replies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content,
        is_public: isPublic
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add reply');
    }

    const { reply } = await response.json();

    // Don't add to local state - wait for real-time update
    // This prevents duplicate messages
    return reply;
  };

  const updateTicket = async (updates: Partial<Ticket>) => {
    if (!ticket) throw new Error('No ticket loaded');
    if (!user) throw new Error('User not authenticated');

    try {
      console.log('📝 Starting ticket update with:', updates);
      console.log('📝 Current ticket state:', ticket);
      
      // Store the old values for change tracking
      const oldValues: Record<string, any> = {};
      const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
      
      // Track changes for each updated field
      Object.keys(updates).forEach(field => {
        // Convert 'group' to 'group_name' in the tracking
        const dbField = field === 'group' ? 'group_name' : field;
        oldValues[dbField] = ticket[dbField as keyof Ticket];
        if (updates[field as keyof Ticket] !== ticket[dbField as keyof Ticket]) {
          changes.push({
            field: dbField,
            oldValue: ticket[dbField as keyof Ticket],
            newValue: updates[field as keyof Ticket]
          });
        }
      });

      console.log('📝 Detected changes:', changes);

      // Only include fields that are actually being updated
      const formattedUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
        // Skip undefined values
        if (value === undefined) return acc;
        
        // Handle special cases
        if (key === 'group') {
          acc['group_name'] = value;
        } else if (key === 'tags') {
          acc['tags'] = JSON.stringify(value);
        } else if (key === 'assigned_to') {
          acc['assigned_to'] = value || null;
        } else {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);

      console.log('📝 Sending formatted updates to Supabase:', formattedUpdates);

      // Get the session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      // Update using the Edge Function
      const response = await fetch(`${EDGE_FUNCTION_URL}/${ticket.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formattedUpdates)
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Error updating ticket:', error);
        throw new Error(error.message || 'Failed to update ticket');
      }

      const { ticket: updatedTicket } = await response.json();
      console.log('✅ Received response from Edge Function:', updatedTicket);

      // Parse the tags back from JSONB to array
      const parsedTicket = {
        ...updatedTicket,
        tags: Array.isArray(updatedTicket.tags) ? updatedTicket.tags : JSON.parse(updatedTicket.tags || '[]')
      };

      console.log('✅ Setting local ticket state to:', parsedTicket);
      
      // Update the local state with the new ticket data
      setTicket(parsedTicket);

      // Return the updated ticket data
      return parsedTicket;
    } catch (error) {
      console.error('❌ Error in updateTicket:', error);
      throw error;
    }
  };

  return {
    ticket,
    messages,
    loading,
    error,
    addReply,
    updateTicket,
    fetchTicket
  };
};