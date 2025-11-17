# Advanced PostgREST Authentication

PostgREST uses JWT (JSON Web Tokens) for authentication and PostgreSQL's Row Level Security (RLS) for authorization. This section covers comprehensive authentication setup.

## JWT Authentication Overview

PostgREST authentication works through:

1. **JWT Tokens** - Contain user claims and roles
2. **Database Roles** - Map to JWT roles for permissions
3. **Row Level Security** - Fine-grained access control
4. **Custom Functions** - Handle login/signup logic

## Database Setup for Authentication

### Create Authentication Schema
```sql
-- Create auth schema
CREATE EXTENSION IF NOT EXISTS auth;

-- Create users table
CREATE TABLE auth.users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create sessions table (optional, for session management)
CREATE TABLE auth.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
);
```

### Create Database Roles
```sql
-- Create roles for different user types
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE admin_user NOLOGIN;
CREATE ROLE regular_user NOLOGIN;

-- Create authenticator role (used by PostgREST)
CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'workshop_auth_pass';

-- Grant role memberships
GRANT authenticated TO authenticator;
GRANT admin_user TO authenticator;
GRANT regular_user TO authenticator;
```

### Set Up Permissions
```sql
-- Grant schema usage
GRANT USAGE ON SCHEMA public TO web_anon, authenticated, admin_user, regular_user;
GRANT USAGE ON SCHEMA auth TO authenticated, admin_user;

-- Anonymous users can only access public endpoints
GRANT SELECT ON public.workshops TO web_anon;

-- Authenticated users have broader access
GRANT SELECT, INSERT, UPDATE ON public.workshops TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.participants TO authenticated;
GRANT SELECT ON auth.users TO authenticated;

-- Admin users have full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_user;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO admin_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO admin_user;

-- Regular users have limited access
GRANT SELECT, INSERT ON public.participants TO regular_user;
GRANT SELECT ON public.workshops TO regular_user;
```

## JWT Configuration

### Update PostgREST Configuration
```ini
# postgrest.conf
db-uri = "postgresql://authenticator:workshop_auth_pass@localhost:5432/workshop"
db-schemas = "public,auth"
db-anon-role = "web_anon"

# JWT Configuration
jwt-secret = "your-super-secret-jwt-key-at-least-32-characters-long"
jwt-aud = "postgrest"

# Role claim key
role-claim-key = ".role"
```

### Environment Variables
```bash
export PGRST_JWT_SECRET="your-super-secret-jwt-key-at-least-32-characters-long"
export PGRST_JWT_AUD="postgrest"
export PGRST_ROLE_CLAIM_KEY=".role"
```

## Authentication Functions

### Password Hashing Function
```sql
-- Install pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to hash passwords
CREATE OR REPLACE FUNCTION auth.hash_password(password TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN crypt(password, gen_salt('bf', 8));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify passwords
CREATE OR REPLACE FUNCTION auth.verify_password(password TEXT, hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN hash = crypt(password, hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### User Registration Function
```sql
CREATE OR REPLACE FUNCTION auth.register_user(
    email TEXT,
    password TEXT,
    user_role TEXT DEFAULT 'regular_user'
)
RETURNS JSON AS $$
DECLARE
    new_user auth.users;
BEGIN
    -- Check if email already exists
    IF EXISTS (SELECT 1 FROM auth.users WHERE auth.users.email = register_user.email) THEN
        RETURN json_build_object('error', 'Email already exists');
    END IF;
    
    -- Insert new user
    INSERT INTO auth.users (email, password_hash, role)
    VALUES (email, auth.hash_password(password), user_role)
    RETURNING * INTO new_user;
    
    RETURN json_build_object(
        'success', true,
        'user_id', new_user.id,
        'email', new_user.email,
        'role', new_user.role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION auth.register_user TO web_anon;
```

### Login Function with JWT Generation
```sql
-- Install pgjwt extension for JWT handling
CREATE EXTENSION IF NOT EXISTS pgjwt;

CREATE OR REPLACE FUNCTION auth.login(
    email TEXT,
    password TEXT
)
RETURNS JSON AS $$
DECLARE
    user_record auth.users;
    jwt_token TEXT;
BEGIN
    -- Find user
    SELECT * INTO user_record
    FROM auth.users
    WHERE auth.users.email = login.email AND active = true;
    
    -- Check if user exists and password is correct
    IF user_record IS NULL OR NOT auth.verify_password(password, user_record.password_hash) THEN
        RETURN json_build_object('error', 'Invalid credentials');
    END IF;
    
    -- Generate JWT token
    jwt_token := sign(
        json_build_object(
            'role', user_record.role,
            'user_id', user_record.id,
            'email', user_record.email,
            'exp', extract(epoch from now() + interval '7 days')
        ),
        current_setting('app.jwt_secret', true)
    );
    
    RETURN json_build_object(
        'token', jwt_token,
        'user', json_build_object(
            'id', user_record.id,
            'email', user_record.email,
            'role', user_record.role
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION auth.login TO web_anon;
```

### Current User Function
```sql
CREATE OR REPLACE FUNCTION auth.current_user()
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'user_id', current_setting('request.jwt.claims', true)::json->>'user_id',
        'email', current_setting('request.jwt.claims', true)::json->>'email',
        'role', current_setting('request.jwt.claims', true)::json->>'role'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION auth.current_user TO authenticated, admin_user, regular_user;
```

## Row Level Security (RLS)

### Enable RLS on Tables
```sql
-- Enable RLS on workshops table
ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;

-- Enable RLS on participants table
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
```

### Create RLS Policies

#### Workshop Policies
```sql
-- Anyone can read workshops
CREATE POLICY "workshops_select_policy" ON workshops
    FOR SELECT USING (true);

-- Only authenticated users can insert workshops
CREATE POLICY "workshops_insert_policy" ON workshops
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Users can only update their own workshops (if we add owner_id column)
-- First, add owner_id column
ALTER TABLE workshops ADD COLUMN owner_id INTEGER REFERENCES auth.users(id);

-- Update policy for workshops
CREATE POLICY "workshops_update_policy" ON workshops
    FOR UPDATE TO authenticated
    USING (owner_id = (current_setting('request.jwt.claims', true)::json->>'user_id')::integer);

-- Admin can do everything
CREATE POLICY "workshops_admin_policy" ON workshops
    FOR ALL TO admin_user
    USING (true)
    WITH CHECK (true);
```

#### Participant Policies
```sql
-- Add user_id to participants table
ALTER TABLE participants ADD COLUMN user_id INTEGER REFERENCES auth.users(id);

-- Users can only see their own registrations
CREATE POLICY "participants_select_policy" ON participants
    FOR SELECT TO authenticated
    USING (user_id = (current_setting('request.jwt.claims', true)::json->>'user_id')::integer);

-- Users can register themselves
CREATE POLICY "participants_insert_policy" ON participants
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'user_id')::integer);

-- Admin can see all participants
CREATE POLICY "participants_admin_policy" ON participants
    FOR ALL TO admin_user
    USING (true)
    WITH CHECK (true);
```

## Using the Authentication API

### Register a New User
```bash
curl -X POST "http://localhost:3000/rpc/register_user" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "user_role": "regular_user"
  }'
```

Response:
```json
{
  "success": true,
  "user_id": 1,
  "email": "user@example.com",
  "role": "regular_user"
}
```

### Login
```bash
curl -X POST "http://localhost:3000/rpc/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "regular_user"
  }
}
```

### Making Authenticated Requests
```bash
# Store the JWT token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Make authenticated request
curl "http://localhost:3000/workshops" \
  -H "Authorization: Bearer $TOKEN"

# Create workshop as authenticated user
curl -X POST "http://localhost:3000/workshops" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Workshop",
    "description": "A workshop I created",
    "duration": 120,
    "instructor": "Me"
  }'
```

### Get Current User Info
```bash
curl -X POST "http://localhost:3000/rpc/current_user" \
  -H "Authorization: Bearer $TOKEN"
```

## Advanced Authentication Features

### Refresh Tokens
```sql
CREATE OR REPLACE FUNCTION auth.refresh_token(
    refresh_token UUID
)
RETURNS JSON AS $$
DECLARE
    session_record auth.sessions;
    user_record auth.users;
    new_token TEXT;
BEGIN
    -- Find valid session
    SELECT * INTO session_record
    FROM auth.sessions
    WHERE id = refresh_token AND expires_at > NOW();
    
    IF session_record IS NULL THEN
        RETURN json_build_object('error', 'Invalid or expired refresh token');
    END IF;
    
    -- Get user
    SELECT * INTO user_record
    FROM auth.users
    WHERE id = session_record.user_id AND active = true;
    
    -- Generate new JWT
    new_token := sign(
        json_build_object(
            'role', user_record.role,
            'user_id', user_record.id,
            'email', user_record.email,
            'exp', extract(epoch from now() + interval '7 days')
        ),
        current_setting('app.jwt_secret', true)
    );
    
    -- Update session expiry
    UPDATE auth.sessions 
    SET expires_at = NOW() + INTERVAL '7 days'
    WHERE id = refresh_token;
    
    RETURN json_build_object('token', new_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Password Reset
```sql
CREATE TABLE auth.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '1 hour',
    used BOOLEAN DEFAULT false
);

CREATE OR REPLACE FUNCTION auth.request_password_reset(
    email TEXT
)
RETURNS JSON AS $$
DECLARE
    user_record auth.users;
    reset_token UUID;
BEGIN
    -- Find user
    SELECT * INTO user_record
    FROM auth.users
    WHERE auth.users.email = request_password_reset.email;
    
    IF user_record IS NULL THEN
        -- Don't reveal if email exists
        RETURN json_build_object('success', true, 'message', 'If email exists, reset link sent');
    END IF;
    
    -- Create reset token
    INSERT INTO auth.password_reset_tokens (user_id)
    VALUES (user_record.id)
    RETURNING id INTO reset_token;
    
    -- In real implementation, send email here
    
    RETURN json_build_object(
        'success', true,
        'message', 'Password reset link sent',
        'reset_token', reset_token -- Remove this in production
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Security Best Practices

1. **Use Strong JWT Secrets** - At least 32 characters, randomly generated
2. **Set Appropriate Token Expiry** - Balance security and user experience
3. **Implement Rate Limiting** - Prevent brute force attacks
4. **Use HTTPS** - Always encrypt data in transit
5. **Validate Input** - Sanitize all user inputs
6. **Regular Security Audits** - Review permissions and policies
7. **Monitor Authentication** - Log and alert on suspicious activity

## Next Steps

With authentication properly configured, let's explore how to use PostgreSQL functions with PostgREST for more complex business logic.