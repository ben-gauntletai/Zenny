import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import '../styles/CreateArticle.css';

interface ArticleFormData {
  title: string;
  content: string;
  category: string;
  tags: string[];
}

const CreateArticle: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [formData, setFormData] = useState<ArticleFormData>({
    title: '',
    content: '',
    category: '',
    tags: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tagInput, setTagInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be logged in to create an article');
      addNotification({
        message: 'You must be logged in to create an article',
        type: 'error'
      });
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { data: article, error: insertError } = await supabase
        .from('knowledge_base')
        .insert([
          {
            title: formData.title,
            content: formData.content,
            category: formData.category,
            tags: formData.tags,
            author_id: user.id
          }
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      addNotification({
        message: 'Article created successfully',
        type: 'success'
      });
      navigate(`/knowledge-base/${article.id}`);
    } catch (err) {
      console.error('Error creating article:', err);
      setError('Failed to create article. Please try again.');
      addNotification({
        message: 'Failed to create article. Please try again.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTagAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!formData.tags.includes(tagInput.trim())) {
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, tagInput.trim()]
        }));
      }
      setTagInput('');
    }
  };

  const handleTagRemove = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  return (
    <div className="create-article">
      <header className="create-article-header">
        <h1>Create Knowledge Base Article</h1>
        <p className="subtitle">Share your knowledge with the community</p>
      </header>

      <form className="article-form" onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}

        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Article title"
            required
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            required
            className="form-input"
          >
            <option value="">Select a category</option>
            <option value="getting-started">Getting Started</option>
            <option value="features">Features</option>
            <option value="troubleshooting">Troubleshooting</option>
            <option value="faq">FAQ</option>
            <option value="best-practices">Best Practices</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="tags">Tags</label>
          <div className="tags-input-container">
            <div className="tags-list">
              {formData.tags.map(tag => (
                <span key={tag} className="tag">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleTagRemove(tag)}
                    className="tag-remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              id="tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagAdd}
              placeholder="Add tags (press Enter)"
              className="form-input tag-input"
            />
          </div>
          <p className="help-text">
            Press Enter to add a tag. Tags help users find related articles.
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="content">Content</label>
          <textarea
            id="content"
            name="content"
            value={formData.content}
            onChange={handleChange}
            placeholder="Write your article content here..."
            required
            className="form-input content-editor"
            rows={15}
          />
          <p className="help-text">
            Use clear and concise language. Include examples where appropriate.
          </p>
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={() => {
              addNotification({
                message: 'Article creation cancelled',
                type: 'info'
              });
              navigate('/knowledge-base');
            }}
            className="cancel-button"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Article'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateArticle; 