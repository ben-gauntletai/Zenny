import React, { useRef, useEffect } from 'react';
import { Ticket, Reply } from '../hooks/useTicket';
import { getProfileColor, getInitials } from '../utils/profileUtils';

type Message = Reply | {
  id: number;
  type: 'system';
  content: string;
  created_at: string;
};

interface CustomerTicketViewProps {
  ticket: Ticket;
  messages: Message[];
  replyContent: string;
  setReplyContent: (content: string) => void;
  handleSubmitReply: () => void;
  onUpdate: (changes: Partial<Ticket>) => Promise<void>;
  pendingChanges: Partial<Ticket>;
}

const getDisplayEmail = (userEmail: string | { email: string }): string => {
  if (typeof userEmail === 'object' && userEmail !== null) {
    return userEmail.email;
  }
  return userEmail;
};

export const CustomerTicketView: React.FC<CustomerTicketViewProps> = ({
  ticket,
  messages,
  replyContent,
  setReplyContent,
  handleSubmitReply,
  onUpdate,
  pendingChanges
}) => {
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

  return (
    <div className="customer-ticket-view">
      <div className="customer-ticket-header">
        <h1 style={{ textAlign: 'center' }}>{ticket.subject}</h1>
        <div className="ticket-meta">
          <div>
            Status: {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
          </div>
          <div className="ticket-owner">
            Agent: {ticket.agents?.full_name || ticket.agents?.email || 'Unassigned'}
          </div>
        </div>
      </div>

      <div className="ticket-conversation" ref={conversationRef}>
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

          const isOwnMessage = message.user_id === ticket.user_id;
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
                    {message.user_profile?.full_name || getDisplayEmail(message.user_email)}
                  </span>
                  <span className="message-time">
                    {new Date(message.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="message-body">{message.content}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="reply-box">
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
          placeholder="Type your message... (Press Enter to submit, Shift + Enter for new line)"
        />
        <button
          className="submit-reply-button"
          onClick={handleSubmitReply}
          disabled={!replyContent.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}; 