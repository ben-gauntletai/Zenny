import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ArticleFeedback.css';

interface ArticleFeedbackProps {
  articleId: string;
}

interface FeedbackState {
  isHelpful: boolean | null;
  feedbackText: string;
  submitted: boolean;
}

const ArticleFeedback: React.FC<ArticleFeedbackProps> = ({ articleId }) => {
  const { user } = useAuth();
  const [feedback, setFeedback] = useState<FeedbackState>({
    isHelpful: null,
    feedbackText: '',
    submitted: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      checkExistingFeedback();
    }
  }, [user, articleId]);

  const checkExistingFeedback = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('article_feedback')
        .select('*')
        .eq('article_id', articleId)
        .eq('user_id', user!.id)
        .single();

      if (fetchError) {
        if (fetchError.code !== 'PGRST116') { // not found error
          throw fetchError;
        }
      }

      if (data) {
        setFeedback({
          isHelpful: data.is_helpful,
          feedbackText: data.feedback_text || '',
          submitted: true
        });
      }
    } catch (err) {
      console.error('Error checking feedback:', err);
      setError('Failed to load feedback');
    }
  };

  const handleFeedbackClick = async (isHelpful: boolean) => {
    if (!user || loading) return;

    try {
      setLoading(true);
      setError('');

      const { error: submitError } = await supabase
        .from('article_feedback')
        .upsert({
          article_id: articleId,
          user_id: user.id,
          is_helpful: isHelpful,
          feedback_text: feedback.feedbackText
        });

      if (submitError) throw submitError;

      setFeedback(prev => ({
        ...prev,
        isHelpful,
        submitted: true
      }));
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || loading || !feedback.isHelpful) return;

    try {
      setLoading(true);
      setError('');

      const { error: submitError } = await supabase
        .from('article_feedback')
        .upsert({
          article_id: articleId,
          user_id: user.id,
          is_helpful: feedback.isHelpful,
          feedback_text: feedback.feedbackText
        });

      if (submitError) throw submitError;

      setFeedback(prev => ({
        ...prev,
        submitted: true
      }));
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="article-feedback">
      <h3>Was this article helpful?</h3>
      
      {error && <div className="error">{error}</div>}

      <div className="feedback-buttons">
        <button
          onClick={() => handleFeedbackClick(true)}
          className={`feedback-button ${feedback.isHelpful === true ? 'active' : ''}`}
          disabled={loading}
        >
          👍 Yes
        </button>
        <button
          onClick={() => handleFeedbackClick(false)}
          className={`feedback-button ${feedback.isHelpful === false ? 'active' : ''}`}
          disabled={loading}
        >
          👎 No
        </button>
      </div>

      {feedback.isHelpful === false && !feedback.submitted && (
        <form onSubmit={handleTextSubmit} className="feedback-form">
          <textarea
            value={feedback.feedbackText}
            onChange={(e) => setFeedback(prev => ({ ...prev, feedbackText: e.target.value }))}
            placeholder="What could we improve? (optional)"
            rows={3}
          />
          <button type="submit" className="submit-button" disabled={loading}>
            Submit Feedback
          </button>
        </form>
      )}

      {feedback.submitted && (
        <p className="feedback-thanks">
          Thank you for your feedback!
        </p>
      )}
    </div>
  );
};

export default ArticleFeedback; 
