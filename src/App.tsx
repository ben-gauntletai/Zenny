import React from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import NotificationProvider from './contexts/NotificationContext';
import NotificationToast from './components/NotificationToast';
import DashboardLayout from './components/DashboardLayout';
import CustomerLayout from './components/CustomerLayout';
import TicketLayout from './components/TicketLayout';
import KnowledgeBaseLayout from './components/KnowledgeBaseLayout';
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
import Navigation from './components/Navigation';
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
          <DashboardLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          path: '',
          element: <Dashboard />
        }
      ]
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
          <TicketLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          path: '',
          element: <TicketList />
        },
        {
          path: 'new',
          element: <CreateTicket />
        },
        {
          path: ':ticketId',
          element: <TicketDetail />
        }
      ]
    },
    {
      path: '/knowledge-base',
      element: (
        <ProtectedRoute>
          <KnowledgeBaseLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          path: '',
          element: <KnowledgeBase />
        },
        {
          path: 'new',
          element: <CreateArticle />
        },
        {
          path: ':articleId',
          element: <ArticleDetail />
        },
        {
          path: 'analytics',
          element: (
            <ProtectedRoute requireAgent>
              <AnalyticsDashboard />
            </ProtectedRoute>
          )
        }
      ]
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