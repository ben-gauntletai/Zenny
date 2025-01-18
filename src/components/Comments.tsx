import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Comments.css';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  parent_id: string | null;
  user: {
    email: string;
  };
  replies?: Comment[];
}

interface CommentsProps {
  articleId: string;
}

const Comments: React.FC<CommentsProps> = ({ articleId }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchComments();
  }, [articleId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('article_comments')
        .select(`
          *,
          user:users (email)
        `)
        .eq('article_id', articleId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Organize comments into threads
      const threads = organizeComments(data || []);
      setComments(threads);
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError('Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  const organizeComments = (flatComments: Comment[]): Comment[] => {
    const commentMap = new Map<string, Comment>();
    const rootComments: Comment[] = [];

    // First pass: Create comment objects
    flatComments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: Organize into threads
    flatComments.forEach(comment => {
      const commentWithReplies = commentMap.get(comment.id)!;
      if (comment.parent_id) {
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          parent.replies?.push(commentWithReplies);
        }
      } else {
        rootComments.push(commentWithReplies);
      }
    });

    return rootComments;
  };

  const handleSubmit = async (e: React.FormEvent, parentId: string | null = null) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    try {
      const { error: submitError } = await supabase
        .from('article_comments')
        .insert({
          article_id: articleId,
          user_id: user.id,
          content: newComment.trim(),
          parent_id: parentId
        });

      if (submitError) throw submitError;

      setNewComment('');
      setReplyTo(null);
      fetchComments();
    } catch (err) {
      console.error('Error submitting comment:', err);
      setError('Failed to submit comment');
    }
  };

  const handleEdit = async (commentId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('article_comments')
        .update({ content: editContent })
        .eq('id', commentId);

      if (updateError) throw updateError;

      setEditingComment(null);
      setEditContent('');
      fetchComments();
    } catch (err) {
      console.error('Error updating comment:', err);
      setError('Failed to update comment');
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('article_comments')
        .delete()
        .eq('id', commentId);

      if (deleteError) throw deleteError;

      fetchComments();
    } catch (err) {
      console.error('Error deleting comment:', err);
      setError('Failed to delete comment');
    }
  };

  const startEdit = (comment: Comment) => {
    setEditingComment(comment.id);
    setEditContent(comment.content);
  };

  const renderComment = (comment: Comment, level: number = 0) => {
    const isEditing = editingComment === comment.id;
    const canModify = user?.id === comment.user_id;
    const isAgent = user?.user_metadata?.role === 'agent';

    return (
      <div
        key={comment.id}
        className="comment"
        style={{ marginLeft: `${level * 2}rem` }}
      >
        <div className="comment-header">
          <span className="comment-author">{comment.user.email}</span>
          <span className="comment-date">
            {new Date(comment.created_at).toLocaleDateString()}
          </span>
        </div>

        {isEditing ? (
          <div className="edit-comment-form">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
            />
            <div className="comment-actions">
              <button
                onClick={() => handleEdit(comment.id)}
                className="save-button"
              >
                Save
              </button>
              <button
                onClick={() => setEditingComment(null)}
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="comment-content">{comment.content}</p>
            <div className="comment-actions">
              {user && (
                <button
                  onClick={() => setReplyTo(comment.id)}
                  className="reply-button"
                >
                  Reply
                </button>
              )}
              {(canModify || isAgent) && (
                <>
                  <button
                    onClick={() => startEdit(comment)}
                    className="edit-button"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="delete-button"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {replyTo === comment.id && (
          <form
            onSubmit={(e) => handleSubmit(e, comment.id)}
            className="comment-form reply-form"
          >
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a reply..."
              rows={3}
              required
            />
            <div className="form-actions">
              <button type="submit" className="submit-button">
                Submit
              </button>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <div className="comment-replies">
            {comment.replies.map(reply => renderComment(reply, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="loading">Loading comments...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="comments-section">
      <h2>Comments</h2>
      
      {user ? (
        <form onSubmit={(e) => handleSubmit(e)} className="comment-form">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            rows={3}
            required
          />
          <button type="submit" className="submit-button">
            Submit
          </button>
        </form>
      ) : (
        <p className="login-prompt">Please log in to leave a comment.</p>
      )}

      <div className="comments-list">
        {comments.length === 0 ? (
          <p className="no-comments">No comments yet. Be the first to comment!</p>
        ) : (
          comments.map(comment => renderComment(comment))
        )}
      </div>
    </div>
  );
};

export default Comments; 
