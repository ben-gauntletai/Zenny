import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import '../styles/ArticleDetail.css';

interface Article {
  id: string;
  title: string;
  content: string;
  category_id: string;
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
  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState<'helpful' | 'not_helpful' | null>(null);

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        // Increment view count
        await supabase.rpc('increment_article_views', { article_id: id });

        // Fetch article details
        const { data, error } = await supabase
          .from('knowledge_base_articles')
          .select(`
            *,
            category:category_id(name),
            author:author_id(email, full_name),
            tags:knowledge_base_article_tags(
              tag:knowledge_base_tags(id, name)
            )
          `)
          .eq('id', id)
          .single();

        if (error) throw error;
        setArticle(data);
      } catch (err) {
        console.error('Error fetching article:', err);
        setError('Failed to load article');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchArticle();
    }
  }, [id]);

  const handleVote = async (isHelpful: boolean) => {
    if (!article || hasVoted) return;

    try {
      const { error } = await supabase.rpc(
        isHelpful ? 'increment_helpful_count' : 'increment_not_helpful_count',
        { article_id: article.id }
      );

      if (error) throw error;

      setHasVoted(isHelpful ? 'helpful' : 'not_helpful');
      setArticle(prev => {
        if (!prev) return null;
        return {
          ...prev,
          helpful_count: prev.helpful_count + (isHelpful ? 1 : 0),
          not_helpful_count: prev.not_helpful_count + (isHelpful ? 0 : 1)
        };
      });
    } catch (err) {
      console.error('Error updating article feedback:', err);
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
        <h1>{article.title}</h1>
        <div className="article-info">
          <span>By {article.author.full_name}</span>
          <span>•</span>
          <span>Updated {new Date(article.updated_at).toLocaleDateString()}</span>
          <span>•</span>
          <span>{article.views_count} views</span>
        </div>
      </div>

      <div className="article-content">
        {article.content.split('\n').map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      {article.tags && article.tags.length > 0 && (
        <div className="article-tags">
          {article.tags.map((tagObj) => (
            <span key={tagObj.id} className="tag">
              {tagObj.name}
            </span>
          ))}
        </div>
      )}

      <div className="article-feedback">
        <p>Was this article helpful?</p>
        <div className="feedback-buttons">
          <button
            onClick={() => handleVote(true)}
            disabled={hasVoted !== null}
            className={`feedback-button ${hasVoted === 'helpful' ? 'voted' : ''}`}
          >
            👍 Yes ({article.helpful_count})
          </button>
          <button
            onClick={() => handleVote(false)}
            disabled={hasVoted !== null}
            className={`feedback-button ${hasVoted === 'not_helpful' ? 'voted' : ''}`}
          >
            👎 No ({article.not_helpful_count})
          </button>
        </div>
      </div>

      {user?.user_metadata?.role === 'agent' && (
        <div className="article-actions">
          <Link to={`/knowledge-base/${article.id}/edit`} className="edit-button">
            Edit Article
          </Link>
        </div>
      )}
    </div>
  );
};

export default ArticleDetail; 