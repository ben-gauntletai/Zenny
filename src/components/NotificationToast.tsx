import React from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import '../styles/NotificationToast.css';

const NotificationToast: React.FC = () => {
  const { notifications, removeNotification } = useNotifications();

  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`notification-toast ${notification.type}`}
          onClick={() => removeNotification(notification.id)}
        >
          <div className="notification-content">
            <span className="notification-message">{notification.message}</span>
          </div>
          <button
            className="notification-close"
            onClick={(e) => {
              e.stopPropagation();
              removeNotification(notification.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default NotificationToast; 