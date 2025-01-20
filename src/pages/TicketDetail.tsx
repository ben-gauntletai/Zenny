import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTicket } from '../contexts/TicketContext';
import { TicketProvider } from '../contexts/TicketContext';
import '../styles/TicketDetail.css';

const TicketContent: React.FC = () => {
  const { ticket, replies, loading, error, addReply } = useTicket();
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

  return (
    <div className="ticket-detail">
      <div className="ticket-main">
        <header className="ticket-header">
          <div className="ticket-title">
            <h1>{ticket.subject}</h1>
            <div className="ticket-subtitle">Via sample ticket</div>
          </div>
          <div className="ticket-actions">
            <button className="icon-button"><i className="filter-icon" /></button>
            <button className="icon-button"><i className="time-icon" /></button>
            <button className="icon-button"><i className="more-icon" /></button>
          </div>
        </header>

        <div className="ticket-conversation">
          <div className="message">
            <div className="message-avatar">
              <img src="/default-avatar.png" alt="The Customer" />
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-author">{ticket.profiles?.email || 'Unknown User'}</span>
                <span className="message-time">
                  {new Date(ticket.created_at).toLocaleString()}
                </span>
              </div>
              <div className="message-body">
                <p>{ticket.description}</p>
              </div>
            </div>
          </div>

          {replies.map(reply => (
            <div key={reply.id} className="message">
              <div className="message-avatar">
                <img src="/default-avatar.png" alt="User" />
              </div>
              <div className="message-content">
                <div className="message-header">
                  <span className="message-author">{reply.user_email}</span>
                  <span className="message-time">
                    {new Date(reply.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="message-body">
                  <p>{reply.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="reply-box">
          <div className="reply-header">
            <div className="reply-type">
              <button className="reply-type-button">Public reply</button>
            </div>
            <div className="reply-to">
              To: <span className="recipient">The Customer</span>
            </div>
            <button className="cc-button">CC</button>
          </div>
          <div className="reply-editor">
            <div className="editor-toolbar">
              <button className="toolbar-button"><i className="format-text" /></button>
              <button className="toolbar-button"><i className="format-bold" /></button>
              <button className="toolbar-button"><i className="format-emoji" /></button>
              <button className="toolbar-button"><i className="format-attachment" /></button>
              <button className="toolbar-button"><i className="format-link" /></button>
            </div>
            <textarea 
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write your reply..."
              className="reply-textarea"
            />
          </div>
        </div>
      </div>

      <div className="ticket-sidebar">
        <div className="sidebar-section">
          <div className="customer-info">
            <div className="customer-header">
              <img src="/default-avatar.png" alt="The Customer" className="customer-avatar" />
              <div className="customer-name">The Customer</div>
            </div>
            <div className="customer-details">
              <div className="detail-row">
                <label>Email</label>
                <div className="detail-value">customer@example.com</div>
              </div>
              <div className="detail-row">
                <label>Local time</label>
                <div className="detail-value">Sun, 11:14 MST</div>
              </div>
              <div className="detail-row">
                <label>Language</label>
                <div className="detail-value">English (United States)</div>
              </div>
              <div className="detail-row">
                <label>Notes</label>
                <textarea 
                  placeholder="Add user notes..."
                  className="notes-textarea"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <h3>Interaction history</h3>
          <div className="interaction-list">
            <div className="interaction-item">
              <div className="interaction-icon" />
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
    </div>
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