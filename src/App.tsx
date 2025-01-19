import React from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import NotificationProvider from './contexts/NotificationContext';
import NotificationToast from './components/NotificationToast';
import Navigation from './components/Navigation';
import CustomerLayout from './components/CustomerLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import TicketList from './pages/TicketList';
import CreateTicket from './pages/CreateTicket';
import TicketDetail from './pages/TicketDetail';
import KnowledgeBase from './pages/KnowledgeBase';
import CreateArticle from './pages/CreateArticle';
import ArticleDetail from './pages/ArticleDetail';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import CustomerList from './pages/CustomerList';
import SuspendedUsers from './pages/SuspendedUsers';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/App.css';

const router = createBrowserRouter(
  [
    {
      path: '/login',
      element: <Login />
    },
    {
      path: '/register',
      element: <Register />
    },
    {
      path: '/',
      element: (
        <ProtectedRoute>
          <>
            <Navigation />
            <main>
              <Dashboard />
            </main>
          </>
        </ProtectedRoute>
      )
    },
    {
      path: '/customers',
      element: (
        <ProtectedRoute>
          <CustomerLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          path: '',
          element: <CustomerList />
        },
        {
          path: 'suspended',
          element: <SuspendedUsers />
        }
      ]
    },
    {
      path: '/tickets',
      element: (
        <ProtectedRoute>
          <>
            <Navigation />
            <main>
              <TicketList />
            </main>
          </>
        </ProtectedRoute>
      )
    },
    {
      path: '/tickets/new',
      element: (
        <ProtectedRoute>
          <>
            <Navigation />
            <main>
              <CreateTicket />
            </main>
          </>
        </ProtectedRoute>
      )
    },
    {
      path: '/tickets/:ticketId',
      element: (
        <ProtectedRoute>
          <>
            <Navigation />
            <main>
              <TicketDetail />
            </main>
          </>
        </ProtectedRoute>
      )
    },
    {
      path: '/knowledge-base',
      element: (
        <ProtectedRoute>
          <>
            <Navigation />
            <main>
              <KnowledgeBase />
            </main>
          </>
        </ProtectedRoute>
      )
    },
    {
      path: '/knowledge-base/new',
      element: (
        <ProtectedRoute requireAgent>
          <>
            <Navigation />
            <main>
              <CreateArticle />
            </main>
          </>
        </ProtectedRoute>
      )
    },
    {
      path: '/knowledge-base/:articleId',
      element: (
        <ProtectedRoute>
          <>
            <Navigation />
            <main>
              <ArticleDetail />
            </main>
          </>
        </ProtectedRoute>
      )
    },
    {
      path: '/knowledge-base/analytics',
      element: (
        <ProtectedRoute requireAgent>
          <>
            <Navigation />
            <main>
              <AnalyticsDashboard />
            </main>
          </>
        </ProtectedRoute>
      )
    }
  ],
  {
    future: {
      v7_relativeSplatPath: true
    }
  }
);

const App: React.FC = () => {
  return (
    <div className="app">
      <AuthProvider>
        <NotificationProvider>
          <NotificationToast />
          <div className="app-container">
            <RouterProvider router={router} />
          </div>
        </NotificationProvider>
      </AuthProvider>
    </div>
  );
};

export default App; 