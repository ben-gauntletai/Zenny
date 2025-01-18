import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/KnowledgeBase.css';

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

interface CategoryCount {
  category: string;
  count: number;
}

const KnowledgeBase: React.FC = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';

  useEffect(() => {
    fetchArticles();
    fetchCategories();
  }, [selectedCategory]);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('knowledge_base')
        .select(`
          *,
          author:users!knowledge_base_author_id_fkey (email)
        `)
        .order('created_at', { ascending: false });

      if (selectedCategory) {
        query = query.eq('category', selectedCategory);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setArticles(data || []);
    } catch (err) {
      console.error('Error fetching articles:', err);
      setError('Failed to load articles');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('category')
        .not('category', 'is', null);

      if (error) throw error;

      // Count articles per category
      const categoryCounts = data.reduce((acc: { [key: string]: number }, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
      }, {});

      const formattedCategories = Object.entries(categoryCounts).map(([category, count]) => ({
        category,
        count
      }));

      setCategories(formattedCategories);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const filteredArticles = articles.filter(article => {
    const searchLower = searchQuery.toLowerCase();
    return (
      article.title.toLowerCase().includes(searchLower) ||
      article.content.toLowerCase().includes(searchLower) ||
      (article.tags && article.tags.some(tag => tag.toLowerCase().includes(searchLower)))
    );
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  return (
    <div className="knowledge-base">
      <div className="kb-header">
        <div className="kb-title-section">
          <h2>Knowledge Base</h2>
          <p className="subtitle">Find answers to common questions and issues</p>
        </div>
        <div className="kb-actions">
          {isAgent && (
            <>
              <Link to="/knowledge-base/analytics" className="analytics-button">
                View Analytics
              </Link>
              <Link to="/knowledge-base/new" className="create-article-button">
                Create Article
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="kb-search">
        <input
          type="text"
          placeholder="Search articles..."
          value={searchQuery}
          onChange={handleSearch}
          className="search-input"
        />
      </div>

      <div className="kb-content">
        <aside className="kb-sidebar">
          <h3>Categories</h3>
          <ul className="category-list">
            <li>
              <button
                className={`category-button ${!selectedCategory ? 'active' : ''}`}
                onClick={() => setSelectedCategory('')}
              >
                All Articles
                <span className="category-count">
                  {articles.length}
                </span>
              </button>
            </li>
            {categories.map(({ category, count }) => (
              <li key={category}>
                <button
                  className={`category-button ${selectedCategory === category ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                  <span className="category-count">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="kb-main">
          {loading ? (
            <div className="loading">Loading articles...</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : filteredArticles.length === 0 ? (
            <div className="no-results">
              No articles found. Try adjusting your search or category filter.
            </div>
          ) : (
            <div className="articles-grid">
              {filteredArticles.map(article => (
                <Link
                  to={`/knowledge-base/${article.id}`}
                  key={article.id}
                  className="article-card"
                >
                  <h3>{article.title}</h3>
                  <p>{article.content.slice(0, 150)}...</p>
                  <div className="article-meta">
                    <span className="category-tag">{article.category}</span>
                    <span className="updated-at">
                      Updated {new Date(article.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  {article.tags && (
                    <div className="article-tags">
                      {article.tags.map(tag => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default KnowledgeBase; 
