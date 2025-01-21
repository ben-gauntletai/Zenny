import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTicket, type Reply, type Ticket } from 'hooks/useTicket';
import { useAuth } from 'contexts/AuthContext';
import { TicketProvider } from 'contexts/TicketContext';
import TicketDetailPanel from 'components/TicketDetailPanel';
import { Box, Flex } from '@chakra-ui/react';
import 'styles/TicketDetail.css';

const TicketContent: React.FC = () => {
  const { ticket, replies, loading, error, addReply, updateTicket } = useTicket();
  const [replyContent, setReplyContent] = useState('');
  const { user } = useAuth();

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
      if (updateTicket) {
        await updateTicket({ [field]: value });
      }
    } catch (err) {
      console.error('Error in handleUpdateTicket:', err);
      // You might want to show an error toast or message here
    }
  };

  return (
    <Flex height="100vh">
      <TicketDetailPanel
        ticket={{
          requester: ticket.profiles || null,
          assignee: ticket.agents ? {
            id: ticket.assigned_to,
            email: ticket.agents.email,
            full_name: ticket.agents.full_name
          } : null,
          tags: ticket.tags || [],
          type: 'incident',
          priority: ticket.priority === 'normal' ? 'Normal' :
                   ticket.priority === 'low' ? 'Low' :
                   ticket.priority === 'high' ? 'High' : 'Normal',
          topic: undefined
        }}
        onUpdate={handleUpdateTicket}
      />
      <Box flex="1" className="ticket-main">
        <header className="ticket-header">
          <div className="ticket-title">
            <h1>{ticket.subject}</h1>
            <div className="ticket-subtitle">Via sample ticket</div>
          </div>
          <div className="ticket-actions">
            <button className="icon-button" title="Filter"><i className="fas fa-filter" /></button>
            <button className="icon-button" title="Time"><i className="fas fa-clock" /></button>
            <button className="icon-button" title="More"><i className="fas fa-ellipsis-v" /></button>
          </div>
        </header>

        <div className="ticket-conversation">
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
                  <span className="message-author">{reply.user_email}</span>
                  <span className="message-time">{new Date(reply.created_at).toLocaleString()}</span>
                </div>
                <div className="message-body">
                  {reply.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="reply-box">
          <div className="reply-header">
            <div className="reply-type">
              <button className="reply-type-button">
                <i className="fas fa-reply"></i>
                Public reply
              </button>
            </div>
            <div className="reply-to">
              To: <span className="recipient">{ticket.profiles?.email}</span>
            </div>
            <button className="cc-button">CC</button>
          </div>
          <div className="reply-editor">
            <div className="editor-toolbar">
              <button className="toolbar-button" title="Text"><i className="fas fa-font"></i></button>
              <button className="toolbar-button" title="Bold"><i className="fas fa-bold"></i></button>
              <button className="toolbar-button" title="Emoji"><i className="fas fa-smile"></i></button>
              <button className="toolbar-button" title="Attach"><i className="fas fa-paperclip"></i></button>
              <button className="toolbar-button" title="Link"><i className="fas fa-link"></i></button>
            </div>
            <textarea
              className="reply-textarea"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write your reply..."
            />
            <div className="reply-actions">
              <button 
                className="submit-button"
                onClick={handleSubmitReply}
                disabled={!replyContent.trim()}
              >
                Submit as {ticket.status}
              </button>
            </div>
          </div>
        </div>
      </Box>

      <div className="ticket-sidebar">
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

        <div className="sidebar-section">
          <h3>Interaction history</h3>
          <div className="interaction-list">
            <div className="interaction-item">
              <div className="interaction-icon">
                <i className="fas fa-comment"></i>
              </div>
              <div className="interaction-content">
                <div className="interaction-title">{ticket.subject}</div>
                <div className="interaction-meta">
                  {new Date(ticket.created_at).toLocaleString()}
                </div>
                <div className="interaction-status">Status: {ticket.status}</div>
              </div>
            </div>
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