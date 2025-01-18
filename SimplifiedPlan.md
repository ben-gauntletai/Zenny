# Zenny (ZenDesk Clone) Simplified Plan

## Table of Contents
1. Introduction
2. Architecture Overview
3. Detailed Features
4. Database Schema (Supabase)
5. React Frontend Implementation
6. AWS Amplify Deployment
7. Security & Best Practices
8. Performance & Scalability
9. Optional Enhancements
10. Implementation Steps & Timeline

---

## 1. Introduction

Zenny is a customer service platform inspired by Zendesk. The goal is to build a minimal-yet-robust solution using:
- Supabase (for database, authentication, and optional file storage)
- React (for the frontend UI)
- AWS Amplify (for hosting)

Our main objective is to limit external service dependencies while maintaining scalability and essential features like ticket management, agent-dashboard, and knowledge base.

---

## 2. Architecture Overview

1. **Frontend (React)**  
   - Single-page application that handles the UI: ticket creation, updates, and agent dashboards.

2. **Backend & Database (Supabase)**  
   - Leverage Supabase Postgres to store application data (tickets, users, articles).  
   - Supabase handles user authentication through JWT tokens.  
   - Optionally, use a minimal Node or serverless function layer (AWS Lambda/Amplify Functions) if advanced logic is needed.

3. **Hosting (AWS Amplify)**  
   - Amplify to host the entire React application.  
   - You can also manage environment variables and set up serverless functions as needed in Amplify.

4. **Storage**  
   - Supabase's built-in object storage for file attachments.  
   - Alternatively, use AWS S3 if you prefer to keep everything on AWS.

---

## 3. Detailed Features

### 3.1 Ticket Management
- **Ticket Creation & Management**  
  - Users submit new tickets describing their issue (title, description, priority).  
  - Agents can reply to tickets, change status, reassign tickets to other agents.
- **Status & Priority**  
  - Basic statuses: Open, Pending, Closed.  
  - Priority levels: Low, Medium, High.
- **Faceted Searches & Filters**  
  - Filter by status, date ranges, keywords, user, etc.
- **Comments & Activity Log**  
  - Users and agents can comment on a ticket.  
  - Each ticket has a chronological activity log to track updates.

### 3.2 Knowledge Base
- **Article Management**  
  - Store articles in Supabase.  
  - Agents or Admins can create, edit, or remove knowledge base articles.  
- **Search Functionality**  
  - Basic text search using Postgres full-text search capabilities.
  - Filter articles by category and tags.

### 3.3 User & Agent Roles
- **Users**  
  - End-users can submit tickets, track their own tickets, and view the knowledge base.  
- **Agents**  
  - Agents see all tickets, manage them, and update statuses.  
  - Access to knowledge base authoring capabilities (optional or restricted to editors).  
- **Admin**  
  - Manage user roles, system configurations, advanced reporting.
- Agents can see all tickets, update statuses, and manage the Knowledge Base.
- Admins have full access to user and platform settings.

### 3.4 Notifications
- **Email Alerts**  
  - On new ticket creation, user receives a confirmation email.  
  - Agents can optionally receive email notifications.  
- **Real-Time Updates (Optional)**  
  - Supabase real-time features could be leveraged to reflect ticket status changes without manual refresh.

### 3.5 Deployment & Environment Clarification
We will maintain separate environments for development, staging, and production to ensure smooth rollouts:
- **Development Environment**:
  - Supabase free-tier project for local testing.
  - Amplify environment variables pointing to the dev database.
- **Staging Environment**:
  - Used before production deployment to test new features with dummy or masked data.
  - Amplify environment variables pointing to the staging Supabase project.
- **Production Environment**:
  - Uses the main Supabase project with paid tiers as required.
  - Amplify environment variables pointing to production keys, allowing higher concurrency.

When switching from staging to production, we will:
1. Commit final changes to the main branch.
2. Configure Amplify to build from main branch with production environment variables.
3. Run any necessary database migrations in Supabase to keep schema consistent.

---

## 4. Database Schema (Supabase)

1. **Tables**  
   - **Users** `(id, email, role, created_at, updated_at, etc.)`  
   - **Tickets** `(id, user_id, title, description, status, priority, created_at, updated_at, etc.)`  
   - **Ticket_Comments** `(id, ticket_id, user_id, comment_text, created_at, etc.)`  
   - **KnowledgeBase** `(id, title, content, category, tags, created_at, updated_at, etc.)`  

2. **Relations**  
   - `Tickets.user_id → Users.id`  
   - `Ticket_Comments.ticket_id → Tickets.id`  
   - `Ticket_Comments.user_id → Users.id`

3. **Row-Level Security**  
   - Enable RLS on the Tickets table to restrict non-agent users to seeing only their own tickets.

---

## 5. React Frontend Implementation

1. **Project Structure Example**  
   ```
   src/
     components/
       TicketList.jsx
       TicketDetail.jsx
       KnowledgeBase.jsx
       ...
     pages/
       Dashboard.jsx
       Login.jsx
       Register.jsx
       ...
     services/
       supabaseClient.js
     App.js
     index.js
     ...
   ```

2. **Authentication**  
   - Use the Supabase JavaScript client to handle sign-in/sign-up flows.  
   - Keep track of current user's auth status in a React context or global state.

3. **User Dashboard**  
   - Upon login, let users see their tickets.  
   - "Create Ticket" button triggers a form for subject, description, and optional attachments.

4. **Agent Dashboard**  
   - Agents can list all tickets, filter by status or priority.  
   - Clicking on a ticket shows the conversation, allows agent replies.

5. **Knowledge Base UI**  
   - A simple search bar with filters.  
   - Category and tag-based navigation.
   - Option to open an article detail page to read or edit.

6. **Styling & Components**  
   - Consider a UI library (Material UI, TailwindCSS, or Chakra UI) to accelerate development.  
   - Create components for ticket previews, lists, modals, search bars, etc.

---

## 6. AWS Amplify Deployment

1. **Setting Up AWS Amplify**  
   - From the command line in your React project:  
     ```
     amplify init
     amplify add hosting
     amplify publish
     ```
   - Configure the Amplify project to connect to your Git repository for CI/CD.

2. **Environment Variables**  
   - In the Amplify console, under "Environment variables," add:  
     - SUPABASE_URL  
     - SUPABASE_ANON_KEY  
     - SUPABASE_SERVICE_ROLE_KEY (if needed for privileged operations)
   - Reference these values in React via process.env (after building, Amplify injects them).

3. **Amplify Functions (Optional)**  
   - If you don't want a separate server, you can add functions (Lambda) to handle advanced interactions or background tasks (like emailing).  
   - Keep in mind you'll need to manage application logic to connect to Supabase from within these functions.

---

## 7. Security & Best Practices

1. **Storing Secrets**  
   - Keep .env local for development.  
   - Use Amplify environment variables in production builds.

2. **Access Control**  
   - Supabase row-level security ensures that end users can only see their own tickets.  
   - Agents have expanded privileges, enforced through RLS policies or separate API routes.

3. **Input Validation**  
   - Implement client-side checks (React) and server-side checks (Supabase triggers, stored procedures, or your Node layer).

4. **Rate Limiting & Abuse Prevention**  
   - Implement rate limiting on ticket creation and API endpoints.
   - Add CAPTCHA for public forms if needed.

5. **Monitoring**  
   - Consider integrating AWS CloudWatch or a third-party monitoring service for logs and alerts.

---

## 8. Performance & Scalability

1. **Database Indexes**  
   - Create indexes on frequently queried columns (ticket status, user_id, etc.).
   - Add full-text search indexes for knowledge base articles.

2. **Caching**  
   - Cache frequently accessed knowledge base articles and ticket lists.
   - Implement client-side caching for better performance.

3. **Scaling Supabase**  
   - Supabase offers storage tiers. You can upgrade if you reach resource or concurrency limits.

4. **Scaling React & Amplify**  
   - Amplify scales the frontend hosting automatically.  
   - For serverless functions, you can leverage concurrency configurations for Lambdas.

---

## 9. Optional Enhancements

1. **Live Chat**  
   - Real-time chat between users and agents, leveraging Supabase's real-time API or a separate socket-based approach.

2. **Multi-Language Support**  
   - Add translations for UI strings.
   - Support multiple languages in knowledge base articles.

3. **Analytics & Reporting**  
   - Collect metrics on ticket volume, average response time, user satisfaction.  
   - Display in an admin dashboard.

4. **Integration Points**  
   - Slack or MS Teams integration for agent notifications.  
   - External CRM integration for user contact details.

---

**Conclusion**  
This simplified plan focuses on building a robust ticketing system with core functionality, removing AI-related features while maintaining scalability and user experience. The system will still provide powerful ticket management, knowledge base functionality, and real-time updates through Supabase's capabilities. 