import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, Ticket as SupabaseTicket, Profile } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import '../styles/TicketDetail.css';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  user_email: string;
}

interface Ticket extends Omit<SupabaseTicket, 'user_id' | 'assigned_to'> {
  user_email: string;
  agent_email?: string;
}

interface DatabaseProfile {
  id: string;
  email: string;
}

interface DatabaseComment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: DatabaseProfile;
}

interface DatabaseTicket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  assigned_to: string | null;
}

interface CommentData {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: {
    email: string;
  };
}

const TicketDetail: React.FC = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ticketId) {
      fetchTicketDetails();
    }
  }, [ticketId]);

  const fetchTicketDetails = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch ticket details
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (ticketError) throw ticketError;

      const typedTicketData = ticketData as DatabaseTicket;

      // Fetch user information
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', [typedTicketData.user_id, typedTicketData.assigned_to].filter(Boolean));

      if (userError) throw userError;

      const userMap = (userData || []).reduce<Record<string, DatabaseProfile>>((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});

      // Format ticket data
      const formattedTicket: Ticket = {
        id: typedTicketData.id,
        title: typedTicketData.title,
        description: typedTicketData.description,
        status: typedTicketData.status,
        priority: typedTicketData.priority,
        created_at: typedTicketData.created_at,
        updated_at: typedTicketData.updated_at,
        user_email: userMap[typedTicketData.user_id]?.email || 'Unknown',
        agent_email: typedTicketData.assigned_to ? userMap[typedTicketData.assigned_to]?.email : undefined
      };

      // Fetch comments
      const { data: commentsData, error: commentsError } = await supabase
        .from('ticket_comments')
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles!inner (
            email
          )
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;

      const typedCommentsData = commentsData as unknown as DatabaseComment[];
      const formattedComments: Comment[] = typedCommentsData.map(comment => ({
        id: comment.id,
        content: comment.content,
        created_at: comment.created_at,
        user_id: comment.user_id,
        user_email: comment.profiles.email
      }));

      setTicket(formattedTicket);
      setComments(formattedComments);
    } catch (err) {
      console.error('Error fetching ticket details:', err);
      setError('Failed to load ticket details');
      addNotification({
        message: 'Failed to load ticket details',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!user || !ticket) return;

    try {
      setSubmitting(true);
      const { error: updateError } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', ticket.id);

      if (updateError) throw updateError;

      setTicket(prev => prev ? { ...prev, status: newStatus } : null);
      addNotification({
        message: 'Ticket status updated successfully',
        type: 'success'
      });
    } catch (err) {
      console.error('Error updating ticket status:', err);
      addNotification({
        message: 'Failed to update ticket status',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!user || !ticket) return;

    try {
      setSubmitting(true);
      const { error: updateError } = await supabase
        .from('tickets')
        .update({ priority: newPriority })
        .eq('id', ticket.id);

      if (updateError) throw updateError;

      setTicket(prev => prev ? { ...prev, priority: newPriority } : null);
      addNotification({
        message: `Ticket priority updated to ${newPriority}`,
        type: 'success'
      });
    } catch (err) {
      console.error('Error updating ticket priority:', err);
      setError('Failed to update ticket priority');
      addNotification({
        message: 'Failed to update ticket priority',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async () => {
    if (!user || !ticket) return;

    try {
      setSubmitting(true);
      const { error: updateError } = await supabase
        .from('tickets')
        .update({ assigned_to: user.id })
        .eq('id', ticket.id);

      if (updateError) throw updateError;

      setTicket(prev => prev ? {
        ...prev,
        agent: { email: user.email || '' }
      } : null);
      addNotification({
        message: 'Ticket assigned to you successfully',
        type: 'success'
      });
    } catch (err) {
      console.error('Error assigning ticket:', err);
      setError('Failed to assign ticket');
      addNotification({
        message: 'Failed to assign ticket',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || !ticket) return;

    try {
      setSubmitting(true);
      const { data: rawCommentData, error: commentError } = await supabase
        .from('ticket_comments')
        .insert([
          {
            ticket_id: ticket.id,
            content: newComment.trim(),
            user_id: user.id
          }
        ])
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles!inner (
            email
          )
        `)
        .single();

      if (commentError) throw commentError;

      // Cast the raw data to our expected type
      const commentData = {
        ...rawCommentData,
        profiles: {
          email: rawCommentData.profiles[0].email
        }
      } as CommentData;

      const typedComment: Comment = {
        id: commentData.id,
        content: commentData.content,
        created_at: commentData.created_at,
        user_id: commentData.user_id,
        user_email: commentData.profiles.email
      };

      setComments(prev => [...prev, typedComment]);
      setNewComment('');
      addNotification({
        message: 'Comment added successfully',
        type: 'success'
      });
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Failed to add comment');
      addNotification({
        message: 'Failed to add comment',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading ticket details...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!ticket) {
    return <div className="error">Ticket not found</div>;
  }

  return (
    <div className="ticket-detail">
      <header className="ticket-header">
        <div className="header-content">
          <h1>{ticket.title}</h1>
          <div className="ticket-meta">
            <span className={`status-badge ${ticket.status.toLowerCase()}`}>
              {ticket.status}
            </span>
            <span className={`priority-badge ${ticket.priority.toLowerCase()}`}>
              {ticket.priority}
            </span>
            <span className="meta-item">
              Created by {ticket.user_email}
            </span>
            <span className="meta-item">
              {new Date(ticket.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        {ticket.agent_email && (
          <div className="ticket-actions">
            <select
              value={ticket.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={submitting}
              className="action-select"
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="solved">Solved</option>
            </select>

            <select
              value={ticket.priority}
              onChange={(e) => handlePriorityChange(e.target.value)}
              disabled={submitting}
              className="action-select"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            {!ticket.agent_email && (
              <button
                onClick={handleAssign}
                disabled={submitting}
                className="assign-button"
              >
                Assign to Me
              </button>
            )}
          </div>
        )}
      </header>

      <div className="ticket-content">
        <div className="ticket-description">
          <h2>Description</h2>
          <p>{ticket.description}</p>
        </div>

        <div className="ticket-comments">
          <h2>Comments</h2>
          
          <div className="comments-list">
            {comments.map(comment => (
              <div key={comment.id} className="comment">
                <div className="comment-header">
                  <span className="comment-author">{comment.user_email}</span>
                  <span className="comment-date">
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="comment-content">{comment.content}</p>
              </div>
            ))}

            {comments.length === 0 && (
              <p className="no-comments">No comments yet</p>
            )}
          </div>

          <form onSubmit={handleCommentSubmit} className="comment-form">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              required
              className="comment-input"
            />
            <button
              type="submit"
              disabled={submitting || !newComment.trim()}
              className="submit-button"
            >
              {submitting ? 'Adding...' : 'Add Comment'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail; 