import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTicket, type Reply, type Ticket } from 'hooks/useTicket';
import { useAuth } from 'contexts/AuthContext';
import { TicketProvider } from 'contexts/TicketContext';
import TicketDetailPanel from 'components/TicketDetailPanel';
import { Box, Flex, Text } from '@chakra-ui/react';
import { supabase } from '../lib/supabaseClient';
import 'styles/TicketDetail.css';

interface Notification {
  id: string;
  type: 'TICKET_CREATED' | 'TICKET_UPDATED' | 'TICKET_ASSIGNED' | 'COMMENT_ADDED';
  ticket_id: number;
  user_id: string;
  details: {
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
    timestamp: string;
  };
  created_at: string;
  user?: {
    email: string;
    full_name: string | null;
  };
}

const TicketContent: React.FC = () => {
  const navigate = useNavigate();
  const { ticket, replies, loading, error, addReply, updateTicket, setTicket } = useTicket();
  const [replyContent, setReplyContent] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Partial<Ticket>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { user } = useAuth();

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
                user:profiles!notifications_user_id_fkey(email, full_name)
              `)
              .eq('id', payload.new.id)
              .single();

            if (!error && data) {
              setNotifications(prev => [data, ...prev]);
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
          user:profiles!notifications_user_id_fkey(email, full_name)
        `)
        .eq('ticket_id', ticket?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  const formatChange = (change: { field: string; oldValue: any; newValue: any }) => {
    const formatValue = (value: any) => {
      if (value === null) return 'none';
      if (Array.isArray(value)) return value.join(', ');
      return value.toString();
    };

    // Format field names to be more readable
    const formatFieldName = (field: string) => {
      switch (field) {
        case 'status':
          return 'Status';
        case 'priority':
          return 'Priority';
        case 'assigned_to':
          return 'Assignee';
        case 'ticket_type':
          return 'Type';
        case 'topic':
          return 'Topic';
        case 'tags':
          return 'Tags';
        default:
          return field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
      }
    };

    return `Changed ${formatFieldName(change.field)} from ${formatValue(change.oldValue)} to ${formatValue(change.newValue)}`;
  };

  const getInteractionIcon = (type: string) => {
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
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!ticket) return <div>Ticket not found</div>;

  const handleSubmitReply = async () => {
    if (!replyContent.trim()) return;
    await addReply(replyContent, true);
    setReplyContent('');
  };

  const handleUpdateTicket = async (field: string, value: unknown) => {
    try {
      console.log('Handling ticket update:', { field, value });
      setPendingChanges(prev => {
        const newChanges = {
          ...prev,
          [field]: value
        };
        console.log('New pending changes:', newChanges);
        return newChanges;
      });
    } catch (err) {
      console.error('Error in handleUpdateTicket:', err);
    }
  };

  const handleSaveChanges = async () => {
    try {
      console.log('Saving changes:', pendingChanges);
      const updatedTicket = await updateTicket(pendingChanges);
      console.log('Updated ticket:', updatedTicket);
      
      if (updatedTicket) {
        // Update the local ticket state with the new values
        setTicket(prev => ({
          ...prev,
          ...updatedTicket
        }));
        
        // Clear pending changes and navigate to dashboard
        setPendingChanges({});
        navigate('/');
      }
    } catch (err) {
      console.error('Error saving changes:', err);
    }
  };

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
          status: ticket.status as 'open' | 'pending' | 'solved' | 'closed'
        }}
        onUpdate={handleUpdateTicket}
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
          </div>
        </header>

        <div className="ticket-conversation" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="message">
            <div className="message-avatar">
              <img src={`https://www.gravatar.com/avatar/${ticket.user_id}?d=mp`} alt="User avatar" />
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-author">{ticket.profiles?.email}</span>
                <span className="message-time">{new Date(ticket.created_at).toLocaleString()}</span>
              </div>
              <div className="message-body">
                {ticket.description}
              </div>
            </div>
          </div>

          {replies.map((reply: Reply) => (
            <div key={reply.id} className="message">
              <div className="message-avatar">
                <img src={`https://www.gravatar.com/avatar/${reply.user_id}?d=mp`} alt="User avatar" />
              </div>
              <div className="message-content">
                <div className="message-header">
                  <span className="message-author">{typeof reply.user_email === 'object' && reply.user_email !== null ? reply.user_email.email : reply.user_email}</span>
                  <span className="message-time">{new Date(reply.created_at).toLocaleString()}</span>
                </div>
                <div className="message-body">
                  {reply.content}
                </div>
              </div>
            </div>
          ))}
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
                <img 
                  src={`https://www.gravatar.com/avatar/${ticket.user_id}?d=mp`}
                  alt="Customer avatar"
                  className="customer-avatar"
                />
                <div className="customer-details">
                  <span className="customer-name">{ticket.profiles?.email}</span>
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
            onClick={handleSaveChanges}
          >
            Save Changes
          </button>
        </div>
      </div>

      <div className="interaction-sidebar">
        <div className="sidebar-section">
          <h3>Interaction history</h3>
          <div className="interaction-list">
            {notifications.map((notification) => (
              <div key={notification.id} className="interaction-item">
                <div className="interaction-icon">
                  <i className={getInteractionIcon(notification.type)}></i>
                </div>
                <div className="interaction-content">
                  <div className="interaction-title">
                    {notification.user?.full_name || notification.user?.email}
                  </div>
                  <div className="interaction-meta">
                    {new Date(notification.created_at).toLocaleString()}
                  </div>
                  <div className="interaction-details">
                    {notification.details?.changes && Array.isArray(notification.details.changes) ? (
                      notification.details.changes.map((change: { field: string; oldValue: any; newValue: any }, index: number) => (
                        <div key={index} className="change-item">
                          {formatChange(change)}
                        </div>
                      ))
                    ) : (
                      <div className="change-item">
                        {notification.type === 'TICKET_CREATED' ? 'Created ticket' :
                         notification.type === 'COMMENT_ADDED' ? 'Added a comment' :
                         notification.type === 'TICKET_ASSIGNED' ? 'Assigned ticket' :
                         'Updated ticket'}
                      </div>
                    )}
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