# AutoCRM Backend

This is the Python FastAPI backend for the AutoCRM functionality.

## Local Development

1. Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your environment variables in `.env`:
   ```
   SUPABASE_URL=your_production_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key
   OPENAI_API_KEY=your_openai_key
   ```

3. Build and run with Docker:
   ```bash
   docker build -t autocrm-api .
   docker run -p 8000:8000 --env-file .env autocrm-api
   ```

4. The API will be available at `http://localhost:8000`

## AWS Amplify Deployment

1. Add the following environment variables in AWS Amplify:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`

2. Update your frontend API calls to use the deployed endpoint:
   ```typescript
   const response = await fetch(
     `${process.env.REACT_APP_API_URL}/autocrm`,
     {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${session?.access_token}`
       },
       body: JSON.stringify({
         query,
         userId,
         displayContent
       })
     }
   );
   ```

## API Endpoints

### POST /autocrm

Handles AutoCRM requests.

**Request Headers:**
- `Authorization`: Bearer token from Supabase auth

**Request Body:**
```json
{
  "query": "string",
  "userId": "string",
  "displayContent": "string (optional)"
}
```

**Response:**
```json
{
  "reply": "string"
}
```

## Error Handling

The API returns appropriate HTTP status codes:
- 400: Bad Request (missing required fields)
- 401: Unauthorized (missing or invalid token)
- 403: Forbidden (user not agent/admin)
- 500: Internal Server Error 