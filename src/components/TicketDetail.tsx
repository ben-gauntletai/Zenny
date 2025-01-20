import React, { useState } from 'react';
import { useTicketContext } from 'contexts/TicketContext';
import { useAuth } from 'contexts/AuthContext';
import 'styles/TicketDetail.css';

const TicketDetail: React.FC = () => {
  const { ticket, replies, loading, error, addReply } = useTicketContext();
  const { user } = useAuth();
  const [replyContent, setReplyContent] = useState('');
  const [isPublicReply, setIsPublicReply] = useState(true);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!ticket) return <div>Ticket not found</div>;

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  const getAvatarUrl = (userId: string) => {
    return `https://www.gravatar.com/avatar/${userId}?d=mp`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    try {
      await addReply(replyContent, isPublicReply);
      setReplyContent('');
    } catch (err) {
      console.error('Failed to add reply:', err);
    }
  };

  return (
    <div className="ticket-detail">
      <div className="ticket-main">
        <div className="ticket-header">
          <div className="ticket-title">
            <h1>{ticket.subject}</h1>
            <div className="ticket-subtitle">
              Created {formatTimeAgo(ticket.created_at)}
            </div>
          </div>
          <div className="ticket-actions">
            <button className="icon-button" title="Share">
              <i className="fas fa-share-alt"></i>
            </button>
            <button className="icon-button" title="Print">
              <i className="fas fa-print"></i>
            </button>
            <button className="icon-button" title="More">
              <i className="fas fa-ellipsis-v"></i>
            </button>
          </div>
        </div>

        <div className="ticket-conversation">
          {replies.map((reply) => (
            <div key={reply.id} className="message">
              <div className="message-avatar">
                <img src={getAvatarUrl(reply.user_id)} alt={reply.user_email} />
              </div>
              <div className="message-content">
                <div className="message-header">
                  <span className="message-author">{reply.user_email}</span>
                  <span className="message-time">
                    {formatTimeAgo(reply.created_at)}
                  </span>
                </div>
                <div className="message-body">{reply.content}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="reply-box">
          <div className="reply-header">
            <button 
              className="reply-type-button"
              onClick={() => setIsPublicReply(!isPublicReply)}
            >
              <i className={`fas fa-${isPublicReply ? 'reply' : 'lock'}`}></i>
              {isPublicReply ? 'Public Reply' : 'Internal Note'}
            </button>
            <span className="reply-to">
              To: <span className="recipient">{ticket.profiles?.email}</span>
            </span>
            <button className="cc-button">
              <i className="fas fa-plus"></i> Add CC
            </button>
          </div>

          <div className="editor-toolbar">
            <button className="toolbar-button" title="Bold">
              <i className="fas fa-bold"></i>
            </button>
            <button className="toolbar-button" title="Italic">
              <i className="fas fa-italic"></i>
            </button>
            <button className="toolbar-button" title="Underline">
              <i className="fas fa-underline"></i>
            </button>
            <button className="toolbar-button" title="List">
              <i className="fas fa-list-ul"></i>
            </button>
            <button className="toolbar-button" title="Link">
              <i className="fas fa-link"></i>
            </button>
            <button className="toolbar-button" title="Image">
              <i className="fas fa-image"></i>
            </button>
            <button className="toolbar-button" title="Code">
              <i className="fas fa-code"></i>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <textarea
              className="reply-textarea"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Type your reply here..."
            />
            <div className="reply-actions">
              <button
                type="submit"
                className="submit-button"
                disabled={!replyContent.trim()}
              >
                Send Reply
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="ticket-sidebar">
        <div className="sidebar-section customer-info">
          <div className="customer-header">
            <img
              src={getAvatarUrl(ticket.user_id)}
              alt={ticket.profiles?.email}
              className="customer-avatar"
            />
            <div className="customer-details">
              <span className="customer-name">{ticket.profiles?.email}</span>
              <span className="customer-type">Customer</span>
            </div>
          </div>
          <div className="detail-row">
            <label>Email</label>
            <div className="detail-value">
              <a href={`mailto:${ticket.profiles?.email}`}>{ticket.profiles?.email}</a>
            </div>
          </div>
          <div className="detail-row">
            <label>Local Time</label>
            <div className="detail-value">
              {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <h3>Properties</h3>
          <div className="detail-row">
            <label>Status</label>
            <div className="detail-value">{ticket.status}</div>
          </div>
          <div className="detail-row">
            <label>Priority</label>
            <div className="detail-value">{ticket.priority}</div>
          </div>
          <div className="detail-row">
            <label>Assigned To</label>
            <div className="detail-value">{ticket.agents?.email || 'Unassigned'}</div>
          </div>
        </div>

        <div className="sidebar-section">
          <h3>Customer Notes</h3>
          <textarea
            className="notes-textarea"
            placeholder="Add notes about this customer..."
          />
        </div>

        <div className="sidebar-section">
          <h3>Recent Interactions</h3>
          <div className="interaction-list">
            <div className="interaction-item">
              <div className="interaction-icon">
                <i className="fas fa-ticket"></i>
              </div>
              <div className="interaction-content">
                <div className="interaction-title">Previous Ticket</div>
                <div className="interaction-meta">2 days ago</div>
                <div className="interaction-status">Resolved</div>
              </div>
            </div>
            <div className="interaction-item">
              <div className="interaction-icon">
                <i className="fas fa-envelope"></i>
              </div>
              <div className="interaction-content">
                <div className="interaction-title">Email Received</div>
                <div className="interaction-meta">5 days ago</div>
                <div className="interaction-status">Support Request</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail; 
