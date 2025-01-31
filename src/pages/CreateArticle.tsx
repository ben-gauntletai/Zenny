import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKnowledgeBase } from '../contexts/KnowledgeBaseContext';
import { supabase } from '../lib/supabaseClient';
import '../styles/CreateArticle.css';

const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const CreateArticle: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { articles, refreshArticles } = useKnowledgeBase();
  const { id } = useParams(); // Get article ID if editing
  
  // Initialize state from context if editing
  const existingArticle = id ? articles.find(a => a.id === id) : null;
  const [title, setTitle] = useState(existingArticle?.title || '');
  const [content, setContent] = useState(existingArticle?.content || '');
  const [categoryId, setCategoryId] = useState(existingArticle?.category_id || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    existingArticle?.tags?.map(tag => tag.id) || []
  );
  
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch article data if editing and not in context
  useEffect(() => {
    const fetchArticle = async () => {
      if (!id || existingArticle) return;

      try {
        const { data: article, error } = await supabase
          .from('knowledge_base_articles')
          .select(`
            *,
            category:knowledge_base_categories(id, name),
            tags:knowledge_base_article_tags(
              knowledge_base_tags(id, name)
            )
          `)
          .eq('id', id)
          .single();

        if (error) throw error;

        setTitle(article.title);
        setContent(article.content);
        setCategoryId(article.category_id);
        setSelectedTags(article.tags.map((tag: { knowledge_base_tags: { id: string } }) => 
          tag.knowledge_base_tags.id
        ));
      } catch (err) {
        console.error('Error fetching article:', err);
        setError('Failed to load article');
      }
    };

    fetchArticle();
  }, [id, existingArticle]);

  // Fetch categories and tags
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [categoriesResponse, tagsResponse] = await Promise.all([
          supabase.from('knowledge_base_categories').select('*'),
          supabase.from('knowledge_base_tags').select('*')
        ]);

        if (categoriesResponse.error) throw categoriesResponse.error;
        if (tagsResponse.error) throw tagsResponse.error;

        setCategories(categoriesResponse.data);
        setTags(tagsResponse.data);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load categories and tags');
      }
    };

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setIsSubmitting(true);
      let articleId = id;

      if (id) {
        // Update existing article
        const { error: updateError } = await supabase
          .from('knowledge_base_articles')
          .update({
            title,
            content,
            category_id: categoryId,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (updateError) throw updateError;

        // Delete existing tags only if the selection has changed
        const { data: existingTags } = await supabase
          .from('knowledge_base_article_tags')
          .select('tag_id')
          .eq('article_id', id);

        const existingTagIds = existingTags?.map(t => t.tag_id) || [];
        const hasTagsChanged = JSON.stringify(existingTagIds.sort()) !== JSON.stringify(selectedTags.sort());

        if (hasTagsChanged) {
          // Delete existing tags
          const { error: deleteTagsError } = await supabase
            .from('knowledge_base_article_tags')
            .delete()
            .eq('article_id', id);

          if (deleteTagsError) throw deleteTagsError;

          // Add new tags
          if (selectedTags.length > 0) {
            const tagConnections = selectedTags.map(tagId => ({
              article_id: id,
              tag_id: tagId
            }));

            const { error: tagError } = await supabase
              .from('knowledge_base_article_tags')
              .insert(tagConnections);

            if (tagError) throw tagError;
          }
        }
      } else {
        // Create new article
        const { data: article, error: createError } = await supabase
          .from('knowledge_base_articles')
          .insert({
            title,
            content,
            category_id: categoryId,
            author_id: user.id,
            views_count: 0,
            helpful_count: 0,
            not_helpful_count: 0,
            status: 'published'
          })
          .select()
          .single();

        if (createError) throw createError;
        articleId = article.id;

        // Add tags for the new article
        if (selectedTags.length > 0) {
          const tagConnections = selectedTags.map(tagId => ({
            article_id: articleId,
            tag_id: tagId
          }));

          const { error: tagError } = await supabase
            .from('knowledge_base_article_tags')
            .insert(tagConnections);

          if (tagError) throw tagError;
        }

        // Generate embeddings for the new article
        try {
          const response = await fetch(`${BACKEND_URL}/api/knowledge-base/generate-embeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
            },
            body: JSON.stringify({ article_id: articleId })
          });

          if (!response.ok) {
            console.error('Failed to generate embeddings:', await response.text());
          }
        } catch (embeddingError) {
          console.error('Error generating embeddings:', embeddingError);
          // Don't throw here, as we still want to navigate to the article even if embedding fails
        }
      }

      await refreshArticles(); // Refresh the articles list
      navigate(`/knowledge-base/article/${articleId}`);
    } catch (err) {
      console.error('Error creating/updating article:', err);
      setError('Failed to save article');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="article-form">
      <div className="form-group">
        <label htmlFor="title">Title</label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
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
        />
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
        {id && (
          <button type="button" className="cancel-button" onClick={() => navigate(-1)}>
            Cancel
          </button>
        )}
        <button type="submit" className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? (id ? 'Updating...' : 'Creating...') : (id ? 'Update' : 'Create')}
        </button>
      </div>
    </form>
  );
};

export default CreateArticle; 