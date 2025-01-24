import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export type Reply = {
  id: number;
  type?: 'reply';
  ticket_id: number;
  content: string;
  created_at: string;
  user_id: string;
  user_email: string | { email: string };
  user_profile?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
  is_internal: boolean;
};

export interface Ticket {
  id: number;
  user_id: string;
  subject: string;
  description: string;
  status: 'open' | 'pending' | 'solved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  ticket_type: 'question' | 'incident' | 'problem' | 'task';
  topic: 'ISSUE' | 'INQUIRY' | 'PAYMENTS' | 'OTHER' | 'NONE' | null;
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
  };
  agents?: { 
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
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

      const channelName = `realtime:${ticketId}`;
      channelRef.current = supabase.channel(channelName);

      // Subscribe to both replies and ticket changes
      channelRef.current
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'replies',
            filter: `ticket_id=eq.${ticketId}`
          },
          handleNewReply
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tickets',
            filter: `id=eq.${ticketId}`
          },
          async (payload: { new: Ticket; old: Ticket }) => {
            console.log('Ticket updated:', payload);
            
            // Check if status changed to closed or solved
            if (
              (payload.new.status === 'closed' || payload.new.status === 'solved') &&
              payload.old.status !== payload.new.status
            ) {
              const otherUser = user?.id === ticket?.user_id ? ticket?.agents : ticket?.profiles;
              const systemMessage: SystemMessage = {
                id: Date.now(),
                type: 'system',
                content: `${otherUser?.full_name || otherUser?.email || 'The other person'} has left the chat`,
                created_at: new Date().toISOString()
              };
              
              setMessages(current => [...current, systemMessage]);
            }
            
            // Update ticket state
            setTicket(current => ({
              ...current,
              ...payload.new
            }));
          }
        )
        .subscribe((status: SubscriptionStatus) => {
          console.log(`Subscription status for ${channelName}:`, status);
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to changes for ticket:', ticketId);
          }
        });

      return () => {
        console.log('Cleaning up subscription for channel:', channelName);
        if (channelRef.current) {
          channelRef.current.unsubscribe();
          channelRef.current = null;
        }
      };
    }
  }, [ticketId, user?.id]);

  const handleNewReply = async (payload: { new: Reply }) => {
    console.log('Received new reply from Postgres:', payload.new);
    
    try {
      // Fetch the complete reply with user profile
      const { data: newReply, error: replyError } = await supabase
        .from('replies')
        .select(`
          *,
          user_profile:profiles!replies_user_id_fkey (
            email,
            full_name,
            avatar_url
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
        
        // Format the reply to match our Reply type
        const formattedReply: Reply = {
          id: newReply.id,
          ticket_id: newReply.ticket_id,
          content: newReply.content,
          created_at: newReply.created_at,
          user_id: newReply.user_id,
          user_email: newReply.user_profile?.email || '',
          is_internal: !newReply.is_public,
          user_profile: {
            full_name: newReply.user_profile?.full_name || null,
            email: newReply.user_profile?.email || '',
            avatar_url: newReply.user_profile?.avatar_url || null
          }
        };

        console.log('Formatted reply:', formattedReply);

        setMessages(current => {
          // Check if reply already exists
          const exists = current.some(reply => reply.id === formattedReply.id);
          console.log('Reply exists in state:', exists);
          
          if (exists) {
            console.log('Reply already exists in state, skipping');
            return current;
          }
          
          console.log('Adding new reply to state. Current length:', current.length);
          const newMessages = [...current, formattedReply];
          console.log('New messages length:', newMessages.length);
          return newMessages;
        });
      }
    } catch (error) {
      console.error('Error processing new reply:', error);
    }
  };

  const fetchTicket = async () => {
    try {
      setLoading(true);
      setError('');

      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          profiles:user_id(email, full_name, avatar_url),
          agents:assigned_to(email, full_name, avatar_url)
        `)
        .eq('id', ticketId)
        .single();

      if (ticketError) throw ticketError;

      const parsedTicket = {
        ...ticketData,
        tags: Array.isArray(ticketData.tags) ? ticketData.tags : JSON.parse(ticketData.tags || '[]')
      };

      const { data: repliesData, error: repliesError } = await supabase
        .from('replies')
        .select(`
          *,
          user_profile:profiles!replies_user_id_fkey (
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (repliesError) throw repliesError;

      setTicket(parsedTicket);
      
      // Convert replies to messages
      const initialMessages: Message[] = [
        // Add initial ticket description as first message
        {
          id: -parseInt(parsedTicket.id), // Use negative ID to ensure uniqueness
          type: 'reply' as const,
          content: parsedTicket.description,
          created_at: parsedTicket.created_at,
          user_id: parsedTicket.user_id,
          ticket_id: parsedTicket.id,
          is_internal: false,
          user_profile: parsedTicket.profiles,
          user_email: parsedTicket.profiles?.email
        },
        // Add existing replies, filtering out the initial reply based on timestamp
        ...repliesData?.filter(reply => {
          // Convert timestamps to Date objects for comparison
          const replyDate = new Date(reply.created_at);
          const ticketDate = new Date(parsedTicket.created_at);
          // Filter out replies that were created within 1 second of the ticket creation
          return Math.abs(replyDate.getTime() - ticketDate.getTime()) > 1000;
        }).map(reply => ({
          ...reply,
          type: 'reply' as const
        })) || []
      ];
      
      // Add system message if ticket is already closed or solved
      if (parsedTicket.status === 'closed' || parsedTicket.status === 'solved') {
        const otherUser = user?.id === parsedTicket.user_id ? parsedTicket.agents : parsedTicket.profiles;
        initialMessages.push({
          id: Date.now(),
          type: 'system',
          content: `${otherUser?.full_name || otherUser?.email || 'The other person'} has left the chat`,
          created_at: parsedTicket.updated_at
        });
      }
      
      setMessages(initialMessages);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const addReply = async (content: string, isPublic = true): Promise<Reply> => {
    if (!user) throw new Error('User not authenticated');
    if (!ticket) throw new Error('No ticket loaded');

    console.log('Adding new reply:', { content, isPublic, ticketId: ticket.id });

    const { data: newReply, error } = await supabase
      .from('replies')
      .insert({
        ticket_id: ticket.id,
        content,
        user_id: user.id,
        is_public: isPublic
      })
      .select(`
        *,
        user_profile:profiles!replies_user_id_fkey (
          email,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      console.error('Error adding reply:', error);
      throw error;
    }

    console.log('Successfully added reply:', newReply);

    // Format the reply consistently with the real-time updates
    const formattedReply: Reply = {
      id: newReply.id,
      ticket_id: newReply.ticket_id,
      content: newReply.content,
      created_at: newReply.created_at,
      user_id: newReply.user_id,
      user_email: newReply.user_profile?.email || '',
      is_internal: !newReply.is_public,
      user_profile: {
        full_name: newReply.user_profile?.full_name || null,
        email: newReply.user_profile?.email || '',
        avatar_url: newReply.user_profile?.avatar_url || null
      }
    };

    // Add formatted reply to local state immediately for instant feedback
    setMessages(current => [...current, formattedReply]);
    
    return formattedReply;
  };

  const updateTicket = async (updates: Partial<Ticket>) => {
    if (!ticket) throw new Error('No ticket loaded');
    if (!user) throw new Error('User not authenticated');

    try {
      console.log('Updating ticket with:', updates);
      
      // Store the old values for change tracking
      const oldValues: Record<string, any> = {};
      const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
      
      // Track changes for each updated field
      Object.keys(updates).forEach(field => {
        // Convert 'group' to 'group_name' in the tracking
        const dbField = field === 'group' ? 'group_name' : field;
        oldValues[dbField] = ticket[field as keyof Ticket];
        if (updates[field as keyof Ticket] !== ticket[field as keyof Ticket]) {
          changes.push({
            field: dbField,
            oldValue: ticket[field as keyof Ticket],
            newValue: updates[field as keyof Ticket]
          });
        }
      });

      // Handle special fields and convert group to group_name
      const formattedUpdates = {
        ...Object.entries(updates).reduce((acc, [key, value]) => {
          if (key === 'group') {
            acc['group_name'] = value;
          } else {
            acc[key] = value;
          }
          return acc;
        }, {} as Record<string, any>),
        // Convert tags array to JSONB if it exists
        tags: updates.tags ? JSON.stringify(updates.tags) : undefined,
        // Handle assignee update - explicitly set to null if empty string or undefined
        assigned_to: 'assigned_to' in updates ? (updates.assigned_to || null) : undefined
      };

      console.log('Formatted updates:', formattedUpdates);

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

      // If there are changes and it's not a new ticket, call the ticket-interactions function
      if (changes.length > 0 && !parsedTicket.isNewTicket) {
        const type = updates.assigned_to !== undefined ? 'TICKET_ASSIGNED' : 'TICKET_UPDATED';
        
        const response = await fetch(
          `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/ticket-interactions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
              ticketId: ticket.id,
              userId: user.id,
              changes,
              type,
              isNewTicket: false
            })
          }
        );

        if (!response.ok) {
          console.error('Failed to record ticket interaction:', await response.json());
        }
      }

      console.log('Raw response data:', data);
      console.log('Parsed ticket:', parsedTicket);
      setTicket(parsedTicket);
      return parsedTicket;
    } catch (err) {
      console.error('Failed to update ticket:', err);
      throw err;
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