import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTicketContext, TicketProvider } from '../contexts/TicketProvider';
import { type Reply, type Ticket } from '../hooks/useTicket';
import { useAuth } from '../contexts/AuthContext';
import TicketDetailPanel from '../components/TicketDetailPanel';
import { Box, Flex, Text } from '@chakra-ui/react';
import { supabase } from '../lib/supabaseClient';
import '../styles/TicketDetail.css';
import { getInitials, getProfileColor } from '../utils/profileUtils';
import { CustomerTicketView } from '../components/CustomerTicketView';

// Existing Notification type for ticket events
interface Notification {
  id: string;
  type: 'TICKET_CREATED' | 'TICKET_UPDATED' | 'TICKET_ASSIGNED' | 'COMMENT_ADDED';
  ticket_id: number;
  user_id: string | null;
  title: string;
  description: string;
  created_at: string;
  user?: {
    full_name: string | null;
    email: string;
  };
  ticket?: {
    profiles?: {
      email: string;
    };
  };
}

// New type for UI feedback
interface UINotification {
  id: string;
  type: 'success' | 'error';
  message: string;
  created_at: string;
}

// Helper function to get the display name for a notification
function getNotificationDisplayName(notification: Notification): string {
  if (notification.user_id === null) {
    return notification.ticket?.profiles?.email || "Support Team";
  }
  return notification.user?.full_name || notification.user?.email || "Unknown User";
}

interface CustomerTicketViewProps {
  ticket: any;
  replies: Reply[];
  replyContent: string;
  setReplyContent: (content: string) => void;
  handleSubmitReply: () => void;
  onUpdate: (changes: Partial<Ticket>) => Promise<void>;
  pendingChanges: Partial<Ticket>;
}

const TicketContent: React.FC = () => {
  const navigate = useNavigate();
  const { ticket, messages, loading, error, addReply, updateTicket } = useTicketContext();
  const [replyContent, setReplyContent] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Partial<Ticket>>({});
  const [ticketNotifications, setTicketNotifications] = useState<Notification[]>([]);
  const [uiNotifications, setUiNotifications] = useState<UINotification[]>([]);
  const { user } = useAuth();
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';
  const conversationRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (conversationRef.current) {
      setTimeout(() => {
        conversationRef.current?.scrollTo({
          top: conversationRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100); // Small delay to ensure content is rendered
    }
  }, [messages]);

  useEffect(() => {
    if (ticket) {
      fetchNotifications();

      // Subscribe to notifications for this ticket
      const subscription = supabase
        .channel(`ticket-${ticket.id}-notifications`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `ticket_id=eq.${ticket.id}`
          },
          async (payload) => {
            // Fetch the complete notification with actor info
            const { data, error } = await supabase
              .from('notifications')
              .select(`
                *,
                user:profiles!notifications_user_id_fkey(email, full_name),
                ticket:tickets!notifications_ticket_id_fkey(
                  profiles:user_id(email, full_name)
                )
              `)
              .eq('id', payload.new.id)
              .single();

            if (!error && data) {
              setTicketNotifications(prev => {
                // Check if we already have a notification of this type at the same time
                const timeKey = new Date(data.created_at).setMilliseconds(0);
                const key = `${data.type}_${timeKey}`;
                
                // Filter out any existing notifications that match this key
                const filteredPrev = prev.filter(n => {
                  const nTimeKey = new Date(n.created_at).setMilliseconds(0);
                  const nKey = `${n.type}_${nTimeKey}`;
                  return nKey !== key;
                });

                // Add the new notification (preferring null user_id)
                return [data as Notification, ...filteredPrev].sort((a, b) => 
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
              });
            }
          }
        )
        .subscribe();

      // Cleanup subscription on unmount
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [ticket]);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          user:profiles!notifications_user_id_fkey(email, full_name),
          ticket:tickets!notifications_ticket_id_fkey(
            profiles:user_id(email, full_name)
          )
        `)
        .eq('ticket_id', ticket?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group notifications by type and created_at (rounded to the nearest second)
      const groupedNotifications = (data as Notification[] | null)?.reduce((acc: { [key: string]: Notification }, notification: Notification) => {
        // Round to nearest second to group notifications created at almost the same time
        const timeKey = new Date(notification.created_at).setMilliseconds(0);
        const key = `${notification.type}_${timeKey}`;
        
        // For each group, prefer notifications with null user_id (visible to all)
        // or keep the first one if no null user_id exists
        if (!acc[key] || notification.user_id === null) {
          acc[key] = notification;
        }
        return acc;
      }, {});

      // Convert back to array and sort by created_at
      const uniqueNotifications = Object.values(groupedNotifications || {})
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTicketNotifications(uniqueNotifications);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  function getInteractionIcon(type: string) {
    switch (type) {
      case 'TICKET_CREATED':
        return 'fas fa-plus-circle';
      case 'TICKET_UPDATED':
        return 'fas fa-edit';
      case 'TICKET_ASSIGNED':
        return 'fas fa-user-plus';
      case 'COMMENT_ADDED':
        return 'fas fa-comment';
      default:
        return 'fas fa-info-circle';
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!ticket) return <div>Ticket not found</div>;

  const handleSubmitReply = async () => {
    if (!replyContent.trim()) return;
    await addReply(replyContent, true);
    setReplyContent('');
    
    // Scroll to bottom after submitting
    setTimeout(() => {
      conversationRef.current?.scrollTo({
        top: conversationRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
  };

  const handleTicketUpdate = async () => {
    try {
      if (Object.keys(pendingChanges).length > 0) {
        await updateTicket(pendingChanges);
        setPendingChanges({});
        setUiNotifications(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'success',
            message: 'Ticket updated successfully',
            created_at: new Date().toISOString()
          }
        ]);
      }
    } catch (error) {
      console.error('Failed to update ticket:', error);
      setUiNotifications(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'error',
          message: 'Failed to update ticket',
          created_at: new Date().toISOString()
        }
      ]);
    }
  };

  // If user is not an agent or admin, show the customer view
  if (!isAgentOrAdmin) {
    return (
      <CustomerTicketView
        ticket={ticket}
        messages={messages}
        replyContent={replyContent}
        setReplyContent={setReplyContent}
        handleSubmitReply={handleSubmitReply}
        onUpdate={handleTicketUpdate}
        pendingChanges={pendingChanges}
      />
    );
  }

  // Return the original agent/admin view
  return (
    <Flex 
      width="100%" 
      height="calc(100vh - 110px)"
      margin="0" 
      marginLeft="1rem"
      marginBottom="50px"
      padding="0" 
      overflow="hidden"
      position="fixed"
      left="0"
      right="0"
      sx={{
        '& > *': {
          margin: 0,
          padding: '1rem'
        }
      }}
    >
      <TicketDetailPanel
        ticket={{
          requester: ticket.profiles || null,
          assignee: ticket.agents || null,
          assigned_to: ticket.assigned_to,
          tags: ticket.tags || [],
          type: ticket.ticket_type || 'incident',
          priority: ticket.priority.toLowerCase() as 'low' | 'normal' | 'high' | 'urgent',
          topic: ticket.topic?.toUpperCase() as 'ISSUE' | 'INQUIRY' | 'PAYMENTS' | 'OTHER' | 'NONE' | null,
          status: ticket.status as 'open' | 'pending' | 'solved' | 'closed',
          group_name: (ticket.group_name || 'Support') as 'Support' | 'Admin'
        }}
        onUpdate={handleTicketUpdate}
        pendingChanges={pendingChanges}
      />

      <Box 
        flex={1} 
        margin={0} 
        padding={0} 
        paddingTop="0"
        height="calc(100vh - 60px)"
        display="flex"
        flexDirection="column"
        overflow="auto"
      >
        <header className="ticket-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem' }}>
          <div className="ticket-title">
            <h1>{ticket.subject}</h1>
          </div>
          <div className="ticket-actions">
            {isAgentOrAdmin && (
              <button 
                className="suspend-button"
                onClick={() => {
                  console.log('Suspend customer clicked');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Suspend Customer
              </button>
            )}
          </div>
        </header>

        <div className="ticket-conversation" ref={conversationRef} style={{ flex: 1, overflowY: 'auto' }}>
          <div className="message other-message">
            <div className="message-avatar">
              <div 
                className="profile-icon" 
                style={{ 
                  backgroundColor: getProfileColor(ticket.profiles?.email || ''),
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%'
                }}
              >
                {getInitials(ticket.profiles?.full_name || '')}
              </div>
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-author">{ticket.profiles?.full_name || ticket.profiles?.email}</span>
                <span className="message-time">{new Date(ticket.created_at).toLocaleString()}</span>
              </div>
              <div className="message-body">
                {ticket.description}
              </div>
            </div>
          </div>

          {messages.map((message) => {
            if (message.type === 'system') {
              return (
                <div key={message.id} className="system-message">
                  <div className="system-message-content">
                    {message.content}
                  </div>
                </div>
              );
            }

            const isOwnMessage = message.user_id === user?.id;
            return (
              <div
                key={message.id}
                className={`message ${isOwnMessage ? 'own-message' : 'other-message'}`}
              >
                <div className="message-avatar">
                  <div 
                    className="profile-icon" 
                    style={{ 
                      backgroundColor: getProfileColor(message.user_profile?.email || ''),
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%'
                    }}
                  >
                    {getInitials(message.user_profile?.full_name || '')}
                  </div>
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-author">
                      {message.user_profile?.full_name || (typeof message.user_email === 'object' && message.user_email !== null 
                        ? message.user_email.email 
                        : message.user_email)}
                    </span>
                    <span className="message-time">{new Date(message.created_at).toLocaleString()}</span>
                  </div>
                  <div className="message-body">
                    {message.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="reply-box" style={{ marginTop: 'auto' }}>
          <div className="reply-editor" style={{ padding: '1rem', width: '100%' }}>
            <div className="editor-toolbar">
              <button className="toolbar-button" title="Text"><i className="fas fa-font"></i></button>
              <button className="toolbar-button" title="Bold"><i className="fas fa-bold"></i></button>
              <button className="toolbar-button" title="Emoji"><i className="fas fa-smile"></i></button>
              <button className="toolbar-button" title="Attach"><i className="fas fa-paperclip"></i></button>
              <button className="toolbar-button" title="Link"><i className="fas fa-link"></i></button>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginTop: '0.5rem' }}>
              <textarea
                className="reply-textarea"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitReply();
                  }
                }}
                placeholder="Write your reply... (Press Enter to submit)"
                style={{ 
                  flex: 1, 
                  minHeight: '100px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  marginBottom: '7%'
                }}
              />
            </div>
          </div>
        </div>
      </Box>

      <div className="ticket-sidebar">
        <div className="sidebar-content">
          <div className="sidebar-section">
            <div className="customer-info">
              <div className="customer-header">
                <div 
                  className="profile-icon" 
                  style={{ 
                    backgroundColor: getProfileColor(ticket.profiles?.email || ''),
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    marginRight: '12px'
                  }}
                >
                  {getInitials(ticket.profiles?.full_name || '')}
                </div>
                <div className="customer-details">
                  <span className="customer-name">{ticket.profiles?.full_name || ticket.profiles?.email}</span>
                  <span className="customer-type">The Customer</span>
                </div>
              </div>
              <div className="detail-row">
                <label>Email</label>
                <div className="detail-value">
                  <a href={`mailto:${ticket.profiles?.email}`}>{ticket.profiles?.email}</a>
                </div>
              </div>
              <div className="detail-row">
                <label>Local time</label>
                <div className="detail-value">
                  {new Intl.DateTimeFormat('en-US', {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                  }).format(new Date())}
                </div>
              </div>
              <div className="detail-row">
                <label>Language</label>
                <div className="detail-value">English (United States)</div>
              </div>
              <div className="detail-row">
                <label>Notes</label>
                <textarea
                  className="notes-textarea"
                  placeholder="Add user notes..."
                />
              </div>
            </div>
          </div>
        </div>
        <div className="save-button-container" style={{ padding: '1rem', marginBottom: '20%' }}>
          <button 
            className="save-button"
            onClick={handleTicketUpdate}
          >
            Save Changes
          </button>
        </div>
      </div>

      <div className="interaction-sidebar">
        <div className="sidebar-section">
          <h3>Interaction history</h3>
          <div className="interaction-list">
            {ticketNotifications.map((notification) => (
              <div key={notification.id} className="interaction-item">
                <div className="interaction-icon">
                  <i className={getInteractionIcon(notification.type)}></i>
                </div>
                <div className="interaction-content">
                  <div className="interaction-title">
                    {notification.title}
                  </div>
                  <div className="interaction-meta">
                    {getNotificationDisplayName(notification)} • {new Date(notification.created_at).toLocaleString()}
                  </div>
                  <div className="interaction-details">
                    <div className="change-item">
                      {notification.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Flex>
  );
};

const TicketDetail: React.FC = () => {
  const { ticketId } = useParams();
  
  if (!ticketId) return <div>Invalid ticket ID</div>;

  return (
    <TicketProvider ticketId={ticketId}>
      <TicketContent />
    </TicketProvider>
  );
};

export default TicketDetail;