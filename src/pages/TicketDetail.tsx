import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTicketContext, TicketProvider } from '../contexts/TicketProvider';
import { type Reply, type Ticket } from '../hooks/useTicket';
import { useAuth } from '../contexts/AuthContext';
import TicketDetailPanel from '../components/TicketDetailPanel';
import { Box, Flex, Text, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure, Button, Avatar } from '@chakra-ui/react';
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
  message: string;
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

interface TicketNote {
  id: number;
  content: string;
  created_at: string;
  user: {
    full_name: string | null;
    email: string;
  };
}

interface DatabaseNote {
  id: number;
  content: string;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
}

interface SupabaseTicketNote {
  id: number;
  content: string;
  created_at: string;
  user: {
    full_name: string | null;
    email: string;
  };
}

type DatabaseTicketNote = {
  id: number;
  content: string;
  created_at: string;
  user: {
    full_name: string | null;
    email: string;
  } | null;
}

interface DBResponse {
  id: number;
  content: string;
  created_at: string;
  user: {
    full_name: string | null;
    email: string;
  } | null;
}

interface SupabaseResponse {
  id: number;
  content: string;
  created_at: string;
  user: {
    full_name: string | null;
    email: string;
  };
}

const TicketContent: React.FC = () => {
  const navigate = useNavigate();
  const { ticket, messages, loading, error, addReply, updateTicket } = useTicketContext();
  const { user } = useAuth();
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';
  
  // State hooks
  const [replyContent, setReplyContent] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Partial<Ticket>>({});
  const [ticketNotifications, setTicketNotifications] = useState<Notification[]>([]);
  const [uiNotifications, setUiNotifications] = useState<UINotification[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [noteContent, setNoteContent] = useState('');
  
  // Other hooks
  const conversationRef = useRef<HTMLDivElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Function declarations
  const fetchNotes = async () => {
    try {
      // First, get all notes
      const { data: notesData, error: notesError } = await supabase
        .from('ticket_notes')
        .select('*')
        .eq('ticket_id', ticket?.id)
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;
      
      if (!notesData) {
        setNotes([]);
        return;
      }

      // Then, get all unique user profiles
      const userIds = Array.from(new Set(notesData.map(note => note.user_id)));
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Create a map of user profiles
      const userMap = (profilesData || []).reduce((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
      }, {} as Record<string, any>);

      // Transform notes with user data
      const transformedNotes = notesData.map(note => ({
        id: note.id,
        content: note.content,
        created_at: note.created_at,
        user: {
          full_name: userMap[note.user_id]?.full_name ?? null,
          email: userMap[note.user_id]?.email ?? ''
        }
      }));
      
      setNotes(transformedNotes);
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  };

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
      setTicketNotifications(data || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  const addNote = async (content: string) => {
    try {
      const { error } = await supabase
        .from('ticket_notes')
        .insert({
          ticket_id: ticket?.id,
          content,
          user_id: user?.id
        });

      if (error) throw error;
      
      setNoteContent('');
      await fetchNotes();
    } catch (err) {
      console.error('Error adding note:', err);
    }
  };

  const deleteNote = async (noteId: number) => {
    try {
      const { error } = await supabase
        .from('ticket_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      
      // Update the notes list after successful deletion
      setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  // Effect hooks
  useEffect(() => {
    if (ticket?.id) {
      fetchNotes();
    }
  }, [ticket?.id]);

  useEffect(() => {
    if (conversationRef.current) {
      setTimeout(() => {
        conversationRef.current?.scrollTo({
          top: conversationRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [messages]);

  useEffect(() => {
    if (ticket) {
      fetchNotifications();

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
                return [data as Notification, ...prev].sort((a, b) => 
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
              });
            }
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [ticket]);

  // Loading and error states
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!ticket) return <div>Ticket not found</div>;

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

  const handleFieldUpdate = async (field: string, value: unknown) => {
    try {
      console.log('🔄 Setting pending change:', field, 'with value:', value);
      // Update pending changes
      setPendingChanges(prev => ({
        ...prev,
        [field]: value
      }));

      // If submit action, update the ticket
      if (field === 'submit') {
        console.log('🔄 Submitting pending changes:', pendingChanges);
        await updateTicket(pendingChanges);
        setPendingChanges({});
        // Navigate to dashboard after successful update
        navigate('/');
      }
    } catch (error) {
      console.error('Failed to update pending changes:', error);
      setUiNotifications(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'error',
          message: 'Failed to update field',
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
        onUpdate={updateTicket}
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
      padding="0" 
      overflow="hidden"
      position="relative"
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
        onUpdate={handleFieldUpdate}
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
                <div className="message-avatar" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  height: '100%',
                  justifyContent: 'center',
                  minWidth: '40px',
                  padding: '8px 0'
                }}>
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
                  <div style={{ 
                    textAlign: 'center', 
                    fontSize: '12px', 
                    color: '#718096',
                    fontWeight: 'bold',
                    lineHeight: '1'
                  }}>
                    {message.user_profile?.role ? message.user_profile.role.charAt(0).toUpperCase() + message.user_profile.role.slice(1).toLowerCase() : ''}
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
                    {isOwnMessage && (
                      <button
                        onClick={() => {/* TODO: Add delete functionality */}}
                        style={{
                          marginLeft: 'auto',
                          padding: '4px 8px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#A0AEC0',
                          fontSize: '14px',
                          transition: 'all 0.2s',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#E53E3E';
                          e.currentTarget.style.background = '#FFF5F5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#A0AEC0';
                          e.currentTarget.style.background = 'none';
                        }}
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Notes
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onOpen}
                  >
                    View notes ({notes.length})
                  </Button>
                </label>
                <textarea
                  className="notes-textarea"
                  placeholder="Add user notes..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && !e.shiftKey && noteContent.trim()) {
                      e.preventDefault();
                      await addNote(noteContent.trim());
                    }
                  }}
                />
              </div>

              {/* Add Notes Modal */}
              <Modal 
                isOpen={isOpen} 
                onClose={onClose} 
                isCentered
                blockScrollOnMount={false}
                motionPreset="scale"
                preserveScrollBarGap
              >
                <ModalOverlay 
                  backgroundColor="rgba(0, 0, 0, 0.4)"
                  backdropFilter="blur(4px)"
                  transition="all 0.2s ease-in-out"
                />
                <ModalContent 
                  width={["95%", "95%", "800px"]}
                  maxWidth="800px"
                  minWidth="320px"
                  maxHeight="90vh"
                  bg="white"
                  boxShadow="0 4px 12px rgba(0, 0, 0, 0.05)"
                  borderRadius="16px"
                  overflow="hidden"
                  mx="auto"
                  display="flex"
                  flexDirection="column"
                >
                  <ModalCloseButton 
                    position="absolute"
                    right="24px"
                    top="24px"
                    zIndex={2}
                  />
                  <ModalHeader 
                    borderBottom="1px solid #E2E8F0" 
                    py="28px"
                    px={["24px", "32px", "40px"]}
                    display="flex"
                    alignItems="center"
                    gap={4}
                    mb={0}
                    bg="white"
                    position="sticky"
                    top={0}
                    zIndex={1}
                  >
                    <i className="fas fa-sticky-note" style={{ 
                      color: '#4299E1',
                      fontSize: '1.5rem',
                      filter: 'drop-shadow(0 2px 4px rgba(66, 153, 225, 0.2))'
                    }}></i>
                    <Text 
                      fontSize={["lg", "xl"]} 
                      fontWeight="600" 
                      color="#2D3748" 
                      letterSpacing="-0.01em"
                      textShadow="0 1px 2px rgba(0, 0, 0, 0.05)"
                    >
                      Ticket Notes History
                    </Text>
                  </ModalHeader>
                  <ModalBody 
                    py="32px"
                    px={["24px", "32px", "40px"]}
                    overflowY="auto"
                    flex="1"
                    sx={{
                      '&::-webkit-scrollbar': {
                        width: '6px',
                      },
                      '&::-webkit-scrollbar-track': {
                        background: '#F7FAFC',
                      },
                      '&::-webkit-scrollbar-thumb': {
                        background: '#CBD5E0',
                        borderRadius: '3px',
                      },
                      '&::-webkit-scrollbar-thumb:hover': {
                        background: '#A0AEC0',
                      },
                    }}
                  >
                    <div className="notes-list" style={{ 
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '24px'
                    }}>
                      {notes.map((note, index) => (
                        <Box
                          key={note.id}
                          p={[4, 5, 6]}
                          borderRadius="xl"
                          bg="white"
                          borderWidth="1px"
                          borderColor="#EDF2F7"
                          boxShadow="0 1px 3px rgba(0, 0, 0, 0.05)"
                          transition="all 0.2s"
                          position="relative"
                          _hover={{
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                            transform: 'translateY(-1px)',
                            borderColor: '#E2E8F0'
                          }}
                        >
                          <Flex gap={6} alignItems="flex-start" mb={5}>
                            <Box
                              minWidth="56px"
                              height="56px"
                              borderRadius="full"
                              overflow="hidden"
                              flexShrink={0}
                            >
                              <Avatar
                                size="xl"
                                name={note.user?.full_name || note.user?.email}
                                bg={getProfileColor(note.user?.email || '')}
                                color="white"
                                boxShadow="0 2px 4px rgba(0, 0, 0, 0.1)"
                                sx={{
                                  width: '56px !important',
                                  height: '56px !important',
                                  borderRadius: '50% !important',
                                  border: '2px solid white',
                                  '& > div': {
                                    fontSize: '1.2rem',
                                    fontWeight: '600'
                                  }
                                }}
                              />
                            </Box>
                            <Box flex="1">
                              <Flex justifyContent="space-between" alignItems="center">
                                <Text 
                                  fontWeight="600" 
                                  color="#2D3748" 
                                  fontSize="1rem"
                                  mb="0.25rem"
                                >
                                  {note.user?.full_name || note.user?.email}
                                </Text>
                                {note.user?.email === user?.email && (
                                  <button
                                    onClick={() => deleteNote(note.id)}
                                    style={{
                                      padding: '4px 8px',
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      color: '#A0AEC0',
                                      fontSize: '14px',
                                      transition: 'all 0.2s',
                                      borderRadius: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = '#E53E3E';
                                      e.currentTarget.style.background = '#FFF5F5';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = '#A0AEC0';
                                      e.currentTarget.style.background = 'none';
                                    }}
                                  >
                                    <i className="fas fa-times"></i>
                                  </button>
                                )}
                              </Flex>
                              <Text fontSize="0.875rem" color="#718096" mb={4}>
                                {new Date(note.created_at).toLocaleString(undefined, {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </Text>
                              <Box
                                p={5}
                                bg="#F8FAFC"
                                borderRadius="lg"
                                borderWidth="1px"
                                borderColor="#EDF2F7"
                                position="relative"
                                ml={0}
                                _before={{
                                  content: '""',
                                  position: 'absolute',
                                  top: '-8px',
                                  left: '24px',
                                  width: '16px',
                                  height: '16px',
                                  bg: '#F8FAFC',
                                  borderLeft: '1px solid #EDF2F7',
                                  borderTop: '1px solid #EDF2F7',
                                  transform: 'rotate(45deg)',
                                  zIndex: 1
                                }}
                              >
                                <Text 
                                  whiteSpace="pre-wrap" 
                                  fontSize="0.9375rem"
                                  lineHeight="1.7" 
                                  color="#4A5568"
                                  letterSpacing="0.01em"
                                  position="relative"
                                  zIndex={2}
                                >
                                  {note.content}
                                </Text>
                              </Box>
                            </Box>
                          </Flex>
                        </Box>
                      ))}
                      {notes.length === 0 && (
                        <Box
                          textAlign="center"
                          py={12}
                          px={6}
                          bg="#F8FAFC"
                          borderRadius="2xl"
                          border="2px dashed #E2E8F0"
                          transition="all 0.2s"
                          _hover={{
                            borderColor: '#CBD5E0',
                            transform: 'scale(1.01)'
                          }}
                        >
                          <Box
                            mb={6}
                            position="relative"
                            display="inline-block"
                          >
                            <i className="fas fa-sticky-note" style={{ 
                              fontSize: '3rem', 
                              color: '#A0AEC0',
                              filter: 'drop-shadow(0 2px 4px rgba(160, 174, 192, 0.2))'
                            }}></i>
                            <Box
                              position="absolute"
                              right="-6px"
                              bottom="-6px"
                              width="24px"
                              height="24px"
                              borderRadius="full"
                              bg="#E2E8F0"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                            >
                              <i className="fas fa-plus" style={{ 
                                fontSize: '0.75rem',
                                color: '#4A5568'
                              }}></i>
                            </Box>
                          </Box>
                          <Text
                            fontSize="1.125rem"
                            fontWeight="600"
                            color="#2D3748"
                            mb={3}
                          >
                            No notes yet
                          </Text>
                          <Text
                            fontSize="0.9375rem"
                            color="#718096"
                            maxWidth="400px"
                            mx="auto"
                            lineHeight="1.6"
                          >
                            Add your first note to keep track of important information about this ticket. Notes help team members stay informed and coordinated.
                          </Text>
                        </Box>
                      )}
                    </div>
                  </ModalBody>
                </ModalContent>
              </Modal>
            </div>
          </div>
        </div>
        <div className="save-button-container" style={{ padding: '1rem', marginBottom: '20%' }}>
          <button 
            className="save-button"
            onClick={async () => {
              try {
                if (Object.keys(pendingChanges).length > 0) {
                  console.log('💾 Saving pending changes:', pendingChanges);
                  await updateTicket(pendingChanges);
                  setPendingChanges({});
                  setUiNotifications(prev => [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      type: 'success',
                      message: 'All changes saved successfully',
                      created_at: new Date().toISOString()
                    }
                  ]);
                  // Navigate to dashboard after successful save
                  navigate('/');
                }
              } catch (error) {
                console.error('Failed to save changes:', error);
                setUiNotifications(prev => [
                  ...prev,
                  {
                    id: Date.now().toString(),
                    type: 'error',
                    message: 'Failed to save changes',
                    created_at: new Date().toISOString()
                  }
                ]);
              }
            }}
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
                      {notification.message}
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