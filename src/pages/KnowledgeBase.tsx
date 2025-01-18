import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import '../styles/KnowledgeBase.css';

interface Category {
  id: number;
  name: string;
  description: string;
}

interface Article {
  id: number;
  title: string;
  content: string;
  category_id: number;
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

const KnowledgeBase: React.FC = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCategories = async () => {
    try {
      const { data, error: categoriesError } = await supabase
        .from('kb_categories')
        .select('*')
        .order('name');

      if (categoriesError) throw categoriesError;

      if (data) {
        setCategories(data);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Failed to load categories. Please try again later.');
    }
  };

  const fetchArticles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      let query = supabase
        .from('kb_articles')
        .select(`
          *,
          author:author_id(email, name),
          tags:kb_article_tags(
            tag:kb_tags(id, name)
          )
        `)
        .eq('published', true)
        .order('views_count', { ascending: false });

      if (selectedCategory) {
        query = query.eq('category_id', selectedCategory);
      }

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);
      }

      const { data: articlesData, error: articlesError } = await query;

      if (articlesError) throw articlesError;

      if (articlesData) {
        const formattedArticles = articlesData.map(article => ({
          ...article,
          tags: article.tags.map((t: any) => t.tag)
        }));
        setArticles(formattedArticles);
      }
    } catch (err) {
      console.error('Error fetching articles:', err);
      setError('Failed to load articles. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const truncateContent = (content: string, maxLength: number = 200) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  if (isLoading) {
    return (
      <div className="kb-loading">
        <div className="loading-spinner" />
        <p>Loading knowledge base...</p>
      </div>
    );
  }

  return (
    <div className="knowledge-base">
      <div className="kb-header">
        <h1>Knowledge Base</h1>
        {user?.user_metadata?.role === 'agent' && (
          <Link to="/knowledge-base/new" className="create-article-button">
            Create Article
          </Link>
        )}
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="kb-search">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search articles..."
        />
      </div>

      <div className="kb-content">
        <div className="kb-categories">
          <h2>Categories</h2>
          <ul>
            <li>
              <button
                className={selectedCategory === null ? 'active' : ''}
                onClick={() => setSelectedCategory(null)}
              >
                All Categories
              </button>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  className={selectedCategory === category.id ? 'active' : ''}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="kb-articles">
          {articles.length === 0 ? (
            <div className="no-articles">
              No articles found
            </div>
          ) : (
            articles.map((article) => (
              <div key={article.id} className="article-card">
                <h3>
                  <Link to={`/knowledge-base/${article.id}`}>
                    {article.title}
                  </Link>
                </h3>
                <p className="article-preview">
                  {truncateContent(article.content)}
                </p>
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
                    <span className="updated-at">
                      Updated {new Date(article.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBase; 