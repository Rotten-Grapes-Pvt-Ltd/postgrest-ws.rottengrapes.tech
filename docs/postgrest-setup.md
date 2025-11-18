# Setting up PostgREST

PostgREST automatically generates a RESTful API from your PostgreSQL database schema. This section covers basic setup and configuration.

## What is PostgREST?

PostgREST is a standalone web server that turns your PostgreSQL database directly into a RESTful API. It:

- **Auto-generates endpoints** from database tables and views
- **Handles authentication** via JWT tokens
- **Supports complex queries** through URL parameters
- **Provides real-time subscriptions** via WebSockets
- **Follows REST conventions** automatically

## Installation Methods

### Using Docker (Recommended)
```bash
# Pull PostgREST image
docker pull postgrest/postgrest

# Run PostgREST container
docker run --name postgrest \
  -p 3000:3000 \
  -e PGRST_DB_URI="postgresql://postgres:workshop123@host.docker.internal:5432/workshop" \
  -e PGRST_DB_SCHEMAS="public" \
  -e PGRST_DB_ANON_ROLE="web_anon" \
  -d postgrest/postgrest
```

### Binary Installation
```bash
# Download latest release
wget https://github.com/PostgREST/postgrest/releases/latest/download/postgrest-v11.2.2-linux-static-x64.tar.xz

# Extract and run
tar -xf postgrest-v11.2.2-linux-static-x64.tar.xz
./postgrest postgrest.conf
```

## Database Setup

### Create Anonymous Roles

This role will be used as default role

```sql
-- Create roles for PostgREST
CREATE ROLE web_anon NOLOGIN;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO web_anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO web_anon;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO web_anon;
```

### Create Sample Tables
```sql
-- Create workshops table
CREATE TABLE workshops (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    duration INTEGER,
    instructor VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create participants table
CREATE TABLE participants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    workshop_id INTEGER REFERENCES workshops(id),
    registered_at TIMESTAMP DEFAULT NOW()
);

-- Grant permissions to web_anon
grant select on public.workshops to web_anon;
grant select on public.participants to web_anon;
```

### Insert Sample Data
```sql
-- Insert sample workshops
INSERT INTO workshops (title, description, duration, instructor) VALUES
('PostgREST Basics', 'Learn the fundamentals of PostgREST API', 120, 'John Doe'),
('Advanced PostgREST', 'Deep dive into PostgREST features', 180, 'Jane Smith'),
('PostGIS Integration', 'Using PostgREST with spatial data', 150, 'Bob Wilson');

-- Insert sample participants
INSERT INTO participants (name, email, workshop_id) VALUES
('Alice Johnson', 'alice@example.com', 1),
('Bob Brown', 'bob@example.com', 1),
('Carol Davis', 'carol@example.com', 2);
```


## Configuration

### PostgREST Configuration File
Create `postgrest.conf`:

```ini
# Database connection
db-uri = "postgresql://authenticator:workshop_auth_pass@localhost:5432/workshop"
db-schemas = "public"
db-anon-role = "web_anon"

# Server settings
server-host = "0.0.0.0"
server-port = 3000

# API settings
db-max-rows = 1000
db-pool = 10
db-pool-timeout = 10
```

### Environment Variables
```bash
export PGRST_DB_URI="postgresql://authenticator:workshop_auth_pass@localhost:5432/workshop"
export PGRST_DB_SCHEMAS="public"
export PGRST_DB_ANON_ROLE="web_anon"
export PGRST_SERVER_PORT=3000
```

!!! note "Remember to restart `PostgREST`"

    Whenever you add new table to the database or make change to the configuration of PostgREST, you need to restart the service

## Basic API Usage

### Starting PostgREST
```bash
# Using configuration file
./postgrest postgrest.conf

# Using environment variables
./postgrest
```

### Testing the API

#### Get All Workshops
```bash
curl "http://localhost:3000/workshops"
```

Response:
```json
[
  {
    "id": 1,
    "title": "PostgREST Basics",
    "description": "Learn the fundamentals of PostgREST API",
    "duration": 120,
    "instructor": "John Doe",
    "created_at": "2024-01-15T10:00:00",
    "updated_at": "2024-01-15T10:00:00"
  }
]
```

#### Get Specific Workshop
```bash
curl "http://localhost:3000/workshops?id=eq.1"
```

!!! failure "Following APIs will not work"

    Since you have only given `SELECT` access to the `web_anon` user you will not be able to make CREATE,UPDATE,DELETE operations

#### Create New Workshop
```bash
curl -X POST "http://localhost:3000/workshops" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Workshop",
    "description": "A new workshop description",
    "duration": 90,
    "instructor": "New Instructor"
  }'
```

#### Update Workshop
```bash
curl -X PATCH "http://localhost:3000/workshops?id=eq.1" \
  -H "Content-Type: application/json" \
  -d '{"duration": 135}'
```

#### Delete Workshop
```bash
curl -X DELETE "http://localhost:3000/workshops?id=eq.1"
```

## Query Parameters

Checkout all available Filtering parameters [here](https://docs.postgrest.org/en/v14/references/api/tables_views.html)

### Filtering

#### Based on columns values

```bash
# Equal
curl "http://localhost:3000/workshops?duration=eq.120"

# Greater than
curl "http://localhost:3000/workshops?duration=gt.100"

# Less than or equal
curl "http://localhost:3000/workshops?duration=lte.150"

# Like (pattern matching)
curl "http://localhost:3000/workshops?title=like.*PostgREST*"

# In list
curl "http://localhost:3000/workshops?id=in.(1,2,3)"
```

#### Based on Pattern Matching

```bash
# Return data where title has GIS 
http://localhost:3000/workshops?title=like.*GIS*
```

#### Based on logical operators

```bash
# Return data where title has GIS or duration < 140
http://localhost:3000/workshops?or=(title.like.*GIS*,duration.lt.140)
```

### Ordering
```bash
# Order by title ascending
curl "http://localhost:3000/workshops?order=title.asc"

# Order by duration descending
curl "http://localhost:3000/workshops?order=duration.desc"

# Multiple ordering
curl "http://localhost:3000/workshops?order=instructor.asc,duration.desc"
```

### Limiting and Pagination
```bash
# Limit results
curl "http://localhost:3000/workshops?limit=5"

# Offset (pagination)
curl "http://localhost:3000/workshops?limit=5&offset=10"

# Range-based pagination
curl "http://localhost:3000/workshops" -H "Range: 0-4"
```

### Column Selection
```bash
# Select specific columns
curl "http://localhost:3000/workshops?select=id,title,duration"

# Select with relationships
curl "http://localhost:3000/workshops?select=title,participants(name,email)"
```

## Relationships and Joins

### Foreign Key Relationships
```bash
# Get workshops with their participants
curl "http://localhost:3000/workshops?select=*,participants(*)"

# Get participants with workshop details
curl "http://localhost:3000/participants?select=*,workshops(title,instructor)"
```

### Filtering on Related Data
```bash
# Get workshops that have participants
curl "http://localhost:3000/workshops?participants=not.is.null&select=*,participants(*)"

# Get participants for specific workshop
curl "http://localhost:3000/participants?workshops.title=eq.PostgREST%20Basics"
```

## Views and Computed Columns

### Create a View
```sql
CREATE VIEW workshop_stats AS
SELECT 
    w.id,
    w.title,
    w.duration,
    COUNT(p.id) as participant_count,
    w.created_at
FROM workshops w
LEFT JOIN participants p ON w.id = p.workshop_id
GROUP BY w.id, w.title, w.duration, w.created_at;

-- Grant permissions
GRANT SELECT ON workshop_stats TO web_anon;
```

### Query the View
```bash
curl "http://localhost:3000/workshop_stats"
```

## Error Handling

### Common HTTP Status Codes
- `200` - Success
- `201` - Created
- `204` - No Content (successful DELETE/PATCH)
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `409` - Conflict

### Error Response Format
```json
{
  "code": "23505",
  "details": "Key (email)=(test@example.com) already exists.",
  "hint": null,
  "message": "duplicate key value violates unique constraint \"participants_email_key\""
}
```

## Performance Considerations

### Database Indexes
```sql
-- Create indexes for frequently queried columns
CREATE INDEX idx_workshops_instructor ON workshops(instructor);
CREATE INDEX idx_participants_workshop_id ON participants(workshop_id);
CREATE INDEX idx_workshops_created_at ON workshops(created_at);
```

### Connection Pooling
```ini
# In postgrest.conf
db-pool = 20
db-pool-timeout = 10
```

### Query Optimization
```bash
# Use column selection to reduce payload
curl "http://localhost:3000/workshops?select=id,title"

# Use appropriate limits
curl "http://localhost:3000/workshops?limit=20"
```

## Exercises

### Exercise 1: Basic API Operations
Using the workshops table:
1. Create a new workshop via POST request
2. Update the workshop duration using PATCH
3. Query workshops by instructor name
4. Delete the workshop you created

```bash
# Your curl commands here
```

### Exercise 2: Advanced Filtering
Write API calls to:
1. Find workshops longer than 2 hours
2. Get workshops created in the last 7 days
3. Find workshops with "PostgREST" in the title
4. Get workshops ordered by duration (shortest first)

```bash
# Your curl commands here
```

### Exercise 3: Relationships and Joins
1. Get all workshops with their participant count
2. Find participants registered for "PostgREST Basics"
3. Get workshops that have more than 1 participant
4. List participants with their workshop titles

```bash
# Your curl commands here
```

### Exercise 4: Create Custom Views
Create database views and test them:
1. `popular_workshops` - workshops with participant count > 2
2. `instructor_stats` - instructor name with workshop count and total duration
3. `recent_registrations` - participants registered in last 30 days

```sql
-- Your SQL here
```

```bash
# Your API calls here
```

### Exercise 5: Performance Testing
1. Create 1000 sample workshops using a script
2. Test pagination with different page sizes
3. Compare response times with and without column selection
4. Create appropriate indexes and measure improvement

```sql
-- Your SQL here
```

```bash
# Your test commands here
```

## Next Steps

Now that you have PostgREST running with basic functionality, let's explore advanced authentication with JWT tokens in the next section.