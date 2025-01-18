import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  users: {
    email: string;
  };
}

interface TicketDetails {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  users: {
    email: string;
  };
  assigned_to?: string;
  assigned_user?: {
    email: string;
  };
}

const TicketDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<TicketDetails | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentError, setCommentError] = useState('');
  const [agents, setAgents] = useState<{ id: string; email: string }[]>([]);
  const userRole = user?.user_metadata?.role || 'user';

  useEffect(() => {
    fetchTicketDetails();
    if (userRole !== 'user') {
      fetchAgents();
    }
  }, [id]);

  const fetchTicketDetails = async () => {
    try {
      setLoading(true);
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          users!tickets_user_id_fkey (email),
          assigned_user:users!tickets_assigned_to_fkey (email)
        `)
        .eq('id', id)
        .single();

      if (ticketError) throw ticketError;

      const { data: commentsData, error: commentsError } = await supabase
        .from('ticket_comments')
        .select(`
          *,
          users (email)
        `)
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;

      setTicket(ticketData);
      setComments(commentsData || []);
    } catch (err) {
      console.error('Error fetching ticket details:', err);
      setError('Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email')
        .in('role', ['agent', 'admin']);

      if (error) throw error;
      setAgents(data || []);
    } catch (err) {
      console.error('Error fetching agents:', err);
    }
  };

  const handleStatusChange = async (newStatus: 'open' | 'pending' | 'closed') => {
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      setTicket(ticket ? { ...ticket, status: newStatus } : null);
    } catch (err) {
      console.error('Error updating ticket status:', err);
      setError('Failed to update ticket status');
    }
  };

  const handleAssigneeChange = async (assigneeId: string) => {
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ assigned_to: assigneeId })
        .eq('id', id);

      if (error) throw error;
      await fetchTicketDetails(); // Refresh to get updated assignee details
    } catch (err) {
      console.error('Error updating ticket assignee:', err);
      setError('Failed to update ticket assignee');
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const { error } = await supabase
        .from('ticket_comments')
        .insert([
          {
            ticket_id: id,
            user_id: user?.id,
            content: newComment.trim(),
          },
        ]);

      if (error) throw error;
      setNewComment('');
      await fetchTicketDetails(); // Refresh comments
    } catch (err) {
      console.error('Error adding comment:', err);
      setCommentError('Failed to add comment');
    }
  };

  if (loading) return <div>Loading ticket details...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!ticket) return <div>Ticket not found</div>;

  return (
    <div className="ticket-detail">
      <div className="ticket-detail-header">
        <h2>{ticket.title}</h2>
        <div className="ticket-meta">
          <span className={`status status-${ticket.status}`}>
            {ticket.status}
          </span>
          <span className={`priority priority-${ticket.priority}`}>
            {ticket.priority}
          </span>
        </div>
      </div>

      <div className="ticket-info">
        <p className="ticket-description">{ticket.description}</p>
        <div className="ticket-metadata">
          <p>Created by: {ticket.users.email}</p>
          <p>Created at: {new Date(ticket.created_at).toLocaleString()}</p>
          {ticket.assigned_user && (
            <p>Assigned to: {ticket.assigned_user.email}</p>
          )}
        </div>
      </div>

      {userRole !== 'user' && (
        <div className="ticket-actions">
          <div className="status-control">
            <label>Status:</label>
            <select
              value={ticket.status}
              onChange={(e) => handleStatusChange(e.target.value as 'open' | 'pending' | 'closed')}
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div className="assignee-control">
            <label>Assign to:</label>
            <select
              value={ticket.assigned_to || ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.email}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="ticket-comments">
        <h3>Comments</h3>
        <div className="comments-list">
          {comments.map((comment) => (
            <div key={comment.id} className="comment">
              <div className="comment-header">
                <span className="comment-author">{comment.users.email}</span>
                <span className="comment-date">
                  {new Date(comment.created_at).toLocaleString()}
                </span>
              </div>
              <p className="comment-content">{comment.content}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleCommentSubmit} className="comment-form">
          {commentError && <div className="error-message">{commentError}</div>}
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            required
          />
          <button type="submit" className="button-primary">
            Add Comment
          </button>
        </form>
      </div>
    </div>
  );
};

export default TicketDetail; 
