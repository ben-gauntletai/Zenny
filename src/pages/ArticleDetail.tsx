import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import '../styles/ArticleDetail.css';

interface Article {
  id: number;
  title: string;
  content: string;
  category: {
    id: number;
    name: string;
  };
  author: {
    email: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
  views_count: number;
  tags: {
    id: number;
    name: string;
  }[];
}

interface RelatedArticle {
  id: number;
  title: string;
  views_count: number;
}

const ArticleDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [article, setArticle] = useState<Article | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<RelatedArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchArticleDetails();
  }, [id]);

  const fetchArticleDetails = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Fetch article details
      const { data: articleData, error: articleError } = await supabase
        .from('kb_articles')
        .select(`
          *,
          category:category_id(id, name),
          author:author_id(email, name),
          tags:kb_article_tags(
            tag:kb_tags(id, name)
          )
        `)
        .eq('id', id)
        .eq('published', true)
        .single();

      if (articleError) throw articleError;

      if (articleData) {
        const formattedArticle = {
          ...articleData,
          tags: articleData.tags.map((t: any) => t.tag)
        };
        setArticle(formattedArticle);

        // Increment view count
        const { error: updateError } = await supabase
          .from('kb_articles')
          .update({ views_count: (articleData.views_count || 0) + 1 })
          .eq('id', id);

        if (updateError) console.error('Error updating view count:', updateError);

        // Fetch related articles from the same category
        const { data: relatedData, error: relatedError } = await supabase
          .from('kb_articles')
          .select('id, title, views_count')
          .eq('category_id', articleData.category_id)
          .eq('published', true)
          .neq('id', id)
          .order('views_count', { ascending: false })
          .limit(5);

        if (relatedError) throw relatedError;

        if (relatedData) {
          setRelatedArticles(relatedData);
        }
      }
    } catch (err) {
      console.error('Error fetching article details:', err);
      setError('Failed to load article. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="article-loading">
        <div className="loading-spinner" />
        <p>Loading article...</p>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="article-error">
        <h2>Article not found</h2>
        <button onClick={() => navigate('/knowledge-base')} className="button-secondary">
          Back to Knowledge Base
        </button>
      </div>
    );
  }

  return (
    <div className="article-detail">
      <div className="article-header">
        <div className="article-breadcrumb">
          <Link to="/knowledge-base">Knowledge Base</Link>
          <span className="separator">/</span>
          <Link to={`/knowledge-base?category=${article.category.id}`}>
            {article.category.name}
          </Link>
        </div>

        <div className="article-title">
          <h1>{article.title}</h1>
          {user?.user_metadata?.role === 'agent' && (
            <Link to={`/knowledge-base/${id}/edit`} className="edit-article-button">
              Edit Article
            </Link>
          )}
        </div>

        <div className="article-meta">
          <div className="article-tags">
            {article.tags.map((tag) => (
              <span key={tag.id} className="tag">
                {tag.name}
              </span>
            ))}
          </div>
          <div className="article-info">
            <span className="views-count">
              {article.views_count} views
            </span>
            <span className="separator">•</span>
            <span className="author">
              By {article.author.name || article.author.email}
            </span>
            <span className="separator">•</span>
            <span className="updated-at">
              Updated {new Date(article.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="article-content">
        <div className="article-body">
          {article.content.split('\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        {relatedArticles.length > 0 && (
          <div className="related-articles">
            <h2>Related Articles</h2>
            <ul>
              {relatedArticles.map((related) => (
                <li key={related.id}>
                  <Link to={`/knowledge-base/${related.id}`}>
                    {related.title}
                  </Link>
                  <span className="views-count">
                    {related.views_count} views
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArticleDetail; 