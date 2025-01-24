import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKnowledgeBase } from '../contexts/KnowledgeBaseContext';
import { supabase } from '../lib/supabaseClient';
import '../styles/ArticleDetail.css';

interface Article {
  id: string;
  title: string;
  content: string;
  category_id: string;
  author_id: string;
  author: {
    email: string;
    full_name: string;
  };
  created_at: string;
  updated_at: string;
  views_count: number;
  helpful_count: number;
  not_helpful_count: number;
  category: {
    name: string;
  };
  tags: {
    id: string;
    name: string;
  }[];
}

const ArticleDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { deleteArticle } = useKnowledgeBase();
  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userFeedback, setUserFeedback] = useState<'helpful' | 'not_helpful' | null>(null);
  const [canDelete, setCanDelete] = useState(false);

  // Add console logging for debugging
  useEffect(() => {
    const isAdmin = user?.user_metadata?.role === 'admin';
    const isAuthor = user?.id === article?.author_id;
    const shouldDelete = Boolean(user && article && (isAuthor || isAdmin));
    
    console.log('Detailed visibility check:', {
      isAdmin,
      isAuthor,
      shouldDelete,
      userRole: user?.user_metadata?.role,
      userId: user?.id,
      authorId: article?.author_id,
      userMetadata: user?.user_metadata,
      articleExists: !!article,
      userExists: !!user,
      fullArticle: article,
      fullUser: user
    });

    setCanDelete(shouldDelete);
  }, [user, article]);

  // Add delete handler
  const handleDelete = async () => {
    if (!article || !window.confirm('Are you sure you want to delete this article?')) {
      return;
    }

    try {
      await deleteArticle(article.id);
      navigate('/knowledge-base');
    } catch (err) {
      console.error('Error during deletion:', err);
      setError('Failed to delete article. Please try again.');
      window.alert('Failed to delete article. Please try again.');
    }
  };

  // Fetch article and user's feedback
  useEffect(() => {
    const fetchArticleAndFeedback = async () => {
      if (!id || !user) return;

      try {
        // Fetch article details
        const { data: articleData, error: articleError } = await supabase
          .from('knowledge_base_articles')
          .select(`
            *,
            category:knowledge_base_categories(name),
            tags:knowledge_base_article_tags(
              knowledge_base_tags(id, name)
            )
          `)
          .eq('id', id)
          .single();

        if (articleError) throw articleError;

        // Fetch user's feedback
        const { data: feedbackData, error: feedbackError } = await supabase
          .from('article_feedback')
          .select('is_helpful')
          .eq('article_id', id)
          .eq('user_id', user.id)
          .single();

        if (feedbackError && feedbackError.code !== 'PGRST116') { // PGRST116 is "not found"
          throw feedbackError;
        }

        // Transform the data
        const transformedData = {
          ...articleData,
          tags: articleData.tags?.map((tag: { knowledge_base_tags: { id: string; name: string } }) => tag.knowledge_base_tags)
        };

        setArticle(transformedData);
        setUserFeedback(feedbackData?.is_helpful ? 'helpful' : feedbackData?.is_helpful === false ? 'not_helpful' : null);
      } catch (err) {
        console.error('Error fetching article:', err);
        setError('Failed to load article');
      } finally {
        setIsLoading(false);
      }
    };

    fetchArticleAndFeedback();
  }, [id, user]);

  const handleVote = async (isHelpful: boolean) => {
    if (!article || !user) return;

    try {
      // If user already voted the same way, remove their vote
      if ((isHelpful && userFeedback === 'helpful') || (!isHelpful && userFeedback === 'not_helpful')) {
        // Delete the feedback
        const { error: deleteError } = await supabase
          .from('article_feedback')
          .delete()
          .eq('article_id', article.id)
          .eq('user_id', user.id);

        if (deleteError) throw deleteError;

        // Update counts
        const { error: updateError } = await supabase
          .from('knowledge_base_articles')
          .update({
            helpful_count: article.helpful_count - (isHelpful ? 1 : 0),
            not_helpful_count: article.not_helpful_count - (isHelpful ? 0 : 1)
          })
          .eq('id', article.id);

        if (updateError) throw updateError;

        setUserFeedback(null);
        setArticle(prev => prev ? {
          ...prev,
          helpful_count: prev.helpful_count - (isHelpful ? 1 : 0),
          not_helpful_count: prev.not_helpful_count - (isHelpful ? 0 : 1)
        } : null);
      } else {
        // If user is changing their vote or voting for the first time
        const oldFeedback = userFeedback;

        // Upsert the feedback
        const { error: feedbackError } = await supabase
          .from('article_feedback')
          .upsert({
            article_id: article.id,
            user_id: user.id,
            is_helpful: isHelpful
          });

        if (feedbackError) throw feedbackError;

        // Update counts
        const { error: updateError } = await supabase
          .from('knowledge_base_articles')
          .update({
            helpful_count: article.helpful_count + (isHelpful ? 1 : 0) - (oldFeedback === 'helpful' ? 1 : 0),
            not_helpful_count: article.not_helpful_count + (isHelpful ? 0 : 1) - (oldFeedback === 'not_helpful' ? 1 : 0)
          })
          .eq('id', article.id);

        if (updateError) throw updateError;

        setUserFeedback(isHelpful ? 'helpful' : 'not_helpful');
        setArticle(prev => prev ? {
          ...prev,
          helpful_count: prev.helpful_count + (isHelpful ? 1 : 0) - (oldFeedback === 'helpful' ? 1 : 0),
          not_helpful_count: prev.not_helpful_count + (isHelpful ? 0 : 1) - (oldFeedback === 'not_helpful' ? 1 : 0)
        } : null);
      }
    } catch (err) {
      console.error('Error updating feedback:', err);
    }
  };

  if (isLoading) {
    return <div className="loading">Loading article...</div>;
  }

  if (error || !article) {
    return <div className="error">{error || 'Article not found'}</div>;
  }

  return (
    <div className="article-detail">
      <div className="article-header">
        <div className="article-meta">
          <Link to="/knowledge-base" className="back-link">
            ← Back to Knowledge Base
          </Link>
          {article.category && (
            <span className="category-tag">{article.category.name}</span>
          )}
        </div>
        <div className="title-row">
          <h1>{article.title}</h1>
          <div className="article-actions">
            <Link to={`/knowledge-base/article/${article.id}/edit`} className="edit-button">
              Edit Article
            </Link>
            <button onClick={handleDelete} className="delete-button">
              Delete Article
            </button>
          </div>
        </div>
        <div className="article-info">
          <div className="info-left">
            <span>Updated {new Date(article.updated_at).toLocaleDateString()}</span>
            <span>•</span>
            <span>{article.views_count} views</span>
          </div>
          {article.tags && article.tags.length > 0 && (
            <div className="info-tags">
              {article.tags.map((tagObj) => (
                <span key={tagObj.id} className="tag">
                  {tagObj.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="article-content">
        {article.content.split('\n').map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      <div className="article-feedback">
        <p>Was this article helpful?</p>
        <div className="feedback-buttons">
          <button
            onClick={() => handleVote(true)}
            className={`feedback-button ${userFeedback === 'helpful' ? 'voted' : ''}`}
          >
            👍 Yes ({article?.helpful_count || 0})
          </button>
          <button
            onClick={() => handleVote(false)}
            className={`feedback-button ${userFeedback === 'not_helpful' ? 'voted' : ''}`}
          >
            👎 No ({article?.not_helpful_count || 0})
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArticleDetail; 