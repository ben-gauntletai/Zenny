import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { KnowledgeBaseProvider } from '../contexts/KnowledgeBaseContext';

const KnowledgeBaseLayout: React.FC = () => {
  return (
    <div className="knowledge-base-page">
      <Navigation />
      <div className="knowledge-base-content">
        <KnowledgeBaseProvider>
          <Outlet />
        </KnowledgeBaseProvider>
      </div>
    </div>
  );
};

export default KnowledgeBaseLayout; 