import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKnowledgeBase } from '../contexts/KnowledgeBaseContext';
import { supabase } from '../lib/supabaseClient';
import '../styles/CreateArticle.css';

interface Category {
  id: string;
  name: string;
}

interface Tag {
  id: string;
  name: string;
}

const CreateArticle: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createArticle } = useKnowledgeBase();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('knowledge_base_categories')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching categories:', error);
        return;
      }

      setCategories(data || []);
    };

    const fetchTags = async () => {
      const { data, error } = await supabase
        .from('knowledge_base_tags')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching tags:', error);
        return;
      }

      setTags(data || []);
    };

    fetchCategories();
    fetchTags();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      // First, create the article
      const { data: article, error: articleError } = await supabase
        .from('knowledge_base_articles')
        .insert([
          {
            title,
            content,
            category_id: categoryId,
            author_id: user.id,
            status: 'published'
          }
        ])
        .select()
        .single();

      if (articleError) throw articleError;

      // Then, add the tags
      if (selectedTags.length > 0 && article) {
        const tagConnections = selectedTags.map(tagId => ({
          article_id: article.id,
          tag_id: tagId
        }));

        const { error: tagError } = await supabase
          .from('knowledge_base_article_tags')
          .insert(tagConnections);

        if (tagError) throw tagError;
      }

      navigate('/knowledge-base');
    } catch (err: any) {
      console.error('Error creating article:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="create-article">
      <div className="create-article-header">
        <h2>Create New Article</h2>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit} className="article-form">
        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Enter article title"
          />
        </div>

        <div className="form-group">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="content">Content</label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            placeholder="Write your article content here..."
            rows={10}
          />
          <p className="help-text">You can use markdown formatting</p>
        </div>

        <div className="form-group">
          <label>Tags</label>
          <div className="tags-container">
            {tags.map((tag) => (
              <label key={tag.id} className="tag-checkbox">
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTags([...selectedTags, tag.id]);
                    } else {
                      setSelectedTags(selectedTags.filter(id => id !== tag.id));
                    }
                  }}
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={() => navigate('/knowledge-base')}
            className="cancel-button"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="submit-button"
          >
            {isLoading ? 'Creating...' : 'Create Article'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateArticle; 