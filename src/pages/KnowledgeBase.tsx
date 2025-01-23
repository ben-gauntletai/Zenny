import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKnowledgeBase } from '../contexts/KnowledgeBaseContext';
import { supabase } from '../lib/supabaseClient';
import '../styles/KnowledgeBase.css';

interface Category {
  id: string;
  name: string;
  description: string;
}

const KnowledgeBase: React.FC = () => {
  const { user } = useAuth();
  const { articles, loading, error } = useKnowledgeBase();
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

    fetchCategories();
  }, []);

  // Filter articles based on selected category and search query
  const filteredArticles = articles.filter(article => {
    const matchesCategory = !selectedCategory || article.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return <div className="loading">Loading articles...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="knowledge-base">
      <div className="kb-header">
        <div className="kb-title-section">
          <h2>Knowledge Base</h2>
          <p className="subtitle">Find answers to common questions and helpful resources</p>
        </div>
        {(user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin') && (
          <Link to="/knowledge-base/new" className="create-article-button">
            Create Article
          </Link>
        )}
      </div>

      <div className="kb-search">
        <input
          type="text"
          className="search-input"
          placeholder="Search articles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="kb-content">
        <div className="kb-sidebar">
          <h3>Categories</h3>
          <ul className="category-list">
            <li>
              <button 
                className={`category-button ${!selectedCategory ? 'active' : ''}`}
                onClick={() => setSelectedCategory(null)}
              >
                All Categories
                <span className="category-count">{articles.length}</span>
              </button>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  className={`category-button ${selectedCategory === category.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.name}
                  <span className="category-count">
                    {articles.filter(article => article.category_id === category.id).length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {filteredArticles.length === 0 ? (
          <div className="no-results">No articles found</div>
        ) : (
          <div className="articles-grid">
            {filteredArticles.map((article) => (
              <Link
                key={article.id}
                to={`/knowledge-base/${article.id}`}
                className="article-card"
              >
                <div className="article-meta">
                  {article.category && (
                    <span className="category-tag">{article.category.name}</span>
                  )}
                  <span className="updated-at">
                    Updated {new Date(article.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <h3>{article.title}</h3>
                <p>{article.content.substring(0, 150)}...</p>
                {article.tags && article.tags.length > 0 && (
                  <div className="article-tags">
                    {article.tags.map((tag) => (
                      <span key={tag.id} className="tag">
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBase; 