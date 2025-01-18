import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import Comments from './Comments';
import ArticleFeedback from './ArticleFeedback';
import useArticleAnalytics from '../hooks/useArticleAnalytics';
import '../styles/ArticleDetail.css';

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  author_id: string;
  author: {
    email: string;
  };
}

const ArticleDetail: React.FC = () => {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';

  // Track article views and time spent
  useArticleAnalytics(articleId || '');

  const [article, setArticle] = useState<Article | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedArticle, setEditedArticle] = useState<Partial<Article>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchArticle();
  }, [articleId]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('knowledge_base')
        .select(`
          *,
          author:users!knowledge_base_author_id_fkey (email)
        `)
        .eq('id', articleId)
        .single();

      if (fetchError) throw fetchError;
      setArticle(data);
      setEditedArticle(data);
    } catch (err) {
      console.error('Error fetching article:', err);
      setError('Failed to load article');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedArticle(article || {});
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditedArticle(prev => ({ ...prev, [name]: value }));
  };

  const handleTagChange = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const input = e.currentTarget;
      const tag = input.value.trim();
      
      if (tag && !editedArticle.tags?.includes(tag)) {
        setEditedArticle(prev => ({
          ...prev,
          tags: [...(prev.tags || []), tag]
        }));
      }
      
      input.value = '';
    }
  };

  const removeTag = (tagToRemove: string) => {
    setEditedArticle(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || []
    }));
  };

  const handleSave = async () => {
    if (!article || !editedArticle.title || !editedArticle.content) return;

    try {
      setSaving(true);
      const { error: updateError } = await supabase
        .from('knowledge_base')
        .update({
          title: editedArticle.title,
          content: editedArticle.content,
          category: editedArticle.category,
          tags: editedArticle.tags
        })
        .eq('id', article.id);

      if (updateError) throw updateError;

      setIsEditing(false);
      fetchArticle(); // Refresh article data
    } catch (err) {
      console.error('Error updating article:', err);
      setError('Failed to update article');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!article || !window.confirm('Are you sure you want to delete this article?')) return;

    try {
      setSaving(true);
      const { error: deleteError } = await supabase
        .from('knowledge_base')
        .delete()
        .eq('id', article.id);

      if (deleteError) throw deleteError;

      navigate('/knowledge-base');
    } catch (err) {
      console.error('Error deleting article:', err);
      setError('Failed to delete article');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading article...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!article) return <div className="error">Article not found</div>;

  return (
    <div className="article-detail">
      <div className="article-header">
        <div className="breadcrumb">
          <Link to="/knowledge-base">Knowledge Base</Link>
          <span className="separator">/</span>
          <span className="current">{isEditing ? 'Edit Article' : article.title}</span>
        </div>

        {isAgent && !isEditing && (
          <div className="article-actions">
            <button onClick={handleEdit} className="edit-button">
              Edit Article
            </button>
            <button onClick={handleDelete} className="delete-button">
              Delete Article
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="edit-form">
          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              type="text"
              id="title"
              name="title"
              value={editedArticle.title || ''}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="category">Category</label>
            <input
              type="text"
              id="category"
              name="category"
              value={editedArticle.category || ''}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="content">Content</label>
            <textarea
              id="content"
              name="content"
              value={editedArticle.content || ''}
              onChange={handleChange}
              rows={15}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="tags">Tags</label>
            <div className="tags-input-container">
              <div className="tags-list">
                {editedArticle.tags?.map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="remove-tag"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                id="tags"
                onKeyDown={handleTagChange}
                placeholder="Add tags (press Enter or comma to add)"
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={handleCancel}
              className="cancel-button"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="save-button"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <article className="article-content">
            <header>
              <h1>{article.title}</h1>
              <div className="article-meta">
                <div className="meta-left">
                  <span className="category-tag">{article.category}</span>
                  <span className="author">By {article.author.email}</span>
                </div>
                <div className="meta-right">
                  <span className="date">
                    Updated {new Date(article.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {article.tags && article.tags.length > 0 && (
                <div className="article-tags">
                  {article.tags.map(tag => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </header>

            <div className="article-body">
              {article.content.split('\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </article>

          <ArticleFeedback articleId={article.id} />
          <Comments articleId={article.id} />
        </>
      )}
    </div>
  );
};

export default ArticleDetail; 
