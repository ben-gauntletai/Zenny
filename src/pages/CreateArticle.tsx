import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKnowledgeBase } from '../contexts/KnowledgeBaseContext';
import { supabase } from '../lib/supabaseClient';
import '../styles/CreateArticle.css';

const CreateArticle: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshArticles } = useKnowledgeBase();
  const { id } = useParams(); // Get article ID if editing
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch article data if editing
  useEffect(() => {
    const fetchArticle = async () => {
      if (!id) {
        setIsLoading(false);
        return;
      }

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
      } finally {
        setIsLoading(false);
      }
    };

    fetchArticle();
  }, [id]);

  // Fetch categories and tags
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch categories
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('knowledge_base_categories')
          .select('*');

        if (categoriesError) throw categoriesError;
        setCategories(categoriesData);

        // Fetch tags
        const { data: tagsData, error: tagsError } = await supabase
          .from('knowledge_base_tags')
          .select('*');

        if (tagsError) throw tagsError;
        setTags(tagsData);
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
      }

      await refreshArticles(); // Refresh the articles list
      navigate(`/knowledge-base/article/${articleId}`);
    } catch (err) {
      console.error('Error creating/updating article:', err);
      setError('Failed to save article');
    }
  };

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

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
        <button type="button" className="cancel-button" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <button type="submit" className="submit-button">
          {id ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
};

export default CreateArticle; 