import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/CreateArticle.css';

interface ArticleFormData {
  title: string;
  content: string;
  category: string;
  tags: string[];
}

const CreateArticle: React.FC = () => {
  const [formData, setFormData] = useState<ArticleFormData>({
    title: '',
    content: '',
    category: '',
    tags: []
  });
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect if not an agent
  if (user?.user_metadata?.role !== 'agent') {
    navigate('/knowledge-base');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be logged in to create an article');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { data, error: insertError } = await supabase
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

      navigate(`/knowledge-base/${data.id}`);
    } catch (err) {
      console.error('Error creating article:', err);
      setError('Failed to create article. Please try again.');
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

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = tagInput.trim();
      
      if (newTag && !formData.tags.includes(newTag)) {
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, newTag]
        }));
      }
      
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  return (
    <div className="create-article">
      <div className="create-article-header">
        <h2>Create Knowledge Base Article</h2>
        <p className="subtitle">
          Share your knowledge to help others solve common problems
        </p>
      </div>

      <form onSubmit={handleSubmit} className="article-form">
        {error && <div className="error-message">{error}</div>}

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
            maxLength={200}
          />
        </div>

        <div className="form-group">
          <label htmlFor="category">Category</label>
          <input
            type="text"
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            placeholder="Article category"
            required
          />
          <p className="help-text">
            Choose a category to help users find related articles
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
            rows={15}
          />
          <p className="help-text">
            Use clear and concise language. You can use markdown for formatting.
          </p>
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
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagInputKeyDown}
              placeholder="Add tags (press Enter or comma to add)"
            />
          </div>
          <p className="help-text">
            Add relevant tags to help users find this article
          </p>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="cancel-button"
            onClick={() => navigate('/knowledge-base')}
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
