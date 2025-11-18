# Workshop Exercise Solutions

This document contains complete solutions for all exercises from the PostgREST workshop modules.

## PostgreSQL Introduction Solutions

### Exercise 1: Basic Table Operations

```sql
-- Create instructors table with constraints
CREATE TABLE instructors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    specialization VARCHAR(20) CHECK (specialization IN ('database', 'web', 'mobile', 'data-science')),
    years_experience INTEGER CHECK (years_experience > 0),
    hourly_rate DECIMAL(8,2) CHECK (hourly_rate >= 50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert sample data
INSERT INTO instructors (name, email, specialization, years_experience, hourly_rate) VALUES
('John Smith', 'john@example.com', 'database', 8, 120.00),
('Sarah Johnson', 'sarah@example.com', 'web', 5, 95.00),
('Mike Chen', 'mike@example.com', 'data-science', 6, 110.00);
```

### Exercise 2: JSONB Practice

```sql
-- Create workshop_feedback table
CREATE TABLE workshop_feedback (
    id SERIAL PRIMARY KEY,
    workshop_id INTEGER REFERENCES workshops(id),
    participant_email VARCHAR(255),
    feedback JSONB
);

-- Insert sample feedback
INSERT INTO workshop_feedback (workshop_id, participant_email, feedback) VALUES
(1, 'alice@example.com', '{"rating": 5, "comments": "Excellent workshop!", "suggestions": ["more hands-on exercises", "longer duration"]}'),
(1, 'bob@example.com', '{"rating": 4, "comments": "Very informative", "suggestions": ["better examples"]}'),
(2, 'carol@example.com', '{"rating": 5, "comments": "Great instructor", "suggestions": ["PostgREST advanced topics"]}');

-- 1. Find all feedback with rating > 4
SELECT * FROM workshop_feedback 
WHERE (feedback->>'rating')::integer > 4;

-- 2. Get average rating per workshop
SELECT 
    w.title,
    ROUND(AVG((f.feedback->>'rating')::integer), 2) as avg_rating
FROM workshop_feedback f
JOIN workshops w ON f.workshop_id = w.id
GROUP BY w.id, w.title;

-- 3. Find workshops mentioned in suggestions
SELECT DISTINCT w.title
FROM workshop_feedback f
JOIN workshops w ON f.workshop_id = w.id
WHERE f.feedback->'suggestions' @> '["PostgREST advanced topics"]';
```

### Exercise 3: Advanced Functions

```sql
CREATE OR REPLACE FUNCTION get_instructor_workload(instructor_name VARCHAR)
RETURNS TABLE(
    total_workshops BIGINT,
    total_hours NUMERIC,
    avg_rating NUMERIC,
    total_revenue NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(w.id)::BIGINT,
        ROUND(SUM(w.duration) / 60.0, 2),
        ROUND(AVG((f.feedback->>'rating')::integer), 2),
        ROUND(SUM(w.price * COALESCE(pc.count, 0)), 2)
    FROM workshops w
    LEFT JOIN workshop_feedback f ON w.id = f.workshop_id
    LEFT JOIN (
        SELECT workshop_id, COUNT(*) as count
        FROM participants
        GROUP BY workshop_id
    ) pc ON w.id = pc.workshop_id
    WHERE w.instructor = instructor_name;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT * FROM get_instructor_workload('John Doe');
```

### Exercise 4: Views and Analytics

```sql
CREATE MATERIALIZED VIEW monthly_workshop_stats AS
SELECT 
    DATE_TRUNC('month', created_at) as month_year,
    COUNT(*) as workshop_count,
    SUM(COALESCE(pc.participant_count, 0)) as total_participants,
    SUM(price * COALESCE(pc.participant_count, 0)) as revenue,
    MODE() WITHIN GROUP (ORDER BY category) as most_popular_category
FROM workshops w
LEFT JOIN (
    SELECT workshop_id, COUNT(*) as participant_count
    FROM participants
    GROUP BY workshop_id
) pc ON w.id = pc.workshop_id
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month_year;

-- Create index
CREATE INDEX idx_monthly_stats_month ON monthly_workshop_stats(month_year);

-- Query the view
SELECT * FROM monthly_workshop_stats;
```

### Exercise 5: ACID Transaction

```sql
BEGIN;

-- 1. Create a new workshop
INSERT INTO workshops (title, description, duration, instructor, price, category)
VALUES ('Advanced SQL', 'Deep dive into SQL optimization', 240, 'John Smith', 399.99, 'technical')
RETURNING id AS workshop_id \gset

-- 2. Assign instructor (update instructor record)
UPDATE instructors 
SET hourly_rate = hourly_rate * 1.1 
WHERE name = 'John Smith';

-- 3. Register 3 participants
INSERT INTO participants (name, email, workshop_id) VALUES
('Participant 1', 'p1@example.com', :workshop_id),
('Participant 2', 'p2@example.com', :workshop_id),
('Participant 3', 'p3@example.com', :workshop_id);

-- 4. Update instructor's workshop count (add column if needed)
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS workshop_count INTEGER DEFAULT 0;
UPDATE instructors 
SET workshop_count = workshop_count + 1 
WHERE name = 'John Smith';

-- Verify all operations
SELECT 'Workshop created' as status, COUNT(*) as count FROM workshops WHERE id = :workshop_id
UNION ALL
SELECT 'Participants registered', COUNT(*) FROM participants WHERE workshop_id = :workshop_id
UNION ALL
SELECT 'Instructor updated', workshop_count FROM instructors WHERE name = 'John Smith';

COMMIT;
```

## PostGIS Introduction Solutions

### Exercise 1: Basic Spatial Data Creation

```sql
-- Create restaurants table with spatial data
CREATE TABLE restaurants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    cuisine_type VARCHAR(50),
    rating DECIMAL(2,1) CHECK (rating >= 1 AND rating <= 5),
    location GEOMETRY(POINT, 4326),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create spatial index
CREATE INDEX idx_restaurants_location ON restaurants USING GIST(location);

-- Insert 5 restaurants in Boston area
INSERT INTO restaurants (name, cuisine_type, rating, location) VALUES
('North End Pizza', 'Italian', 4.5, ST_SetSRID(ST_MakePoint(-71.0547, 42.3647), 4326)),
('Chinatown Express', 'Chinese', 4.2, ST_SetSRID(ST_MakePoint(-71.0603, 42.3505), 4326)),
('Back Bay Bistro', 'French', 4.8, ST_SetSRID(ST_MakePoint(-71.0742, 42.3505), 4326)),
('Cambridge Cafe', 'American', 4.0, ST_SetSRID(ST_MakePoint(-71.1190, 42.3736), 4326)),
('Fenway Grill', 'American', 4.3, ST_SetSRID(ST_MakePoint(-71.0972, 42.3467), 4326));
```

### Exercise 2: Distance and Proximity Analysis

```sql
-- 1. Find all museums within 2km of Harvard University
SELECT 
    l.name,
    l.category,
    ROUND(ST_Distance(
        l.location::geography,
        (SELECT location FROM locations WHERE name = 'Harvard University')::geography
    )::numeric, 2) as distance_meters
FROM locations l
WHERE l.category = 'museum'
AND ST_DWithin(
    l.location::geography,
    (SELECT location FROM locations WHERE name = 'Harvard University')::geography,
    2000
);

-- 2. Calculate walking distance between all educational institutions
SELECT 
    l1.name as institution1,
    l2.name as institution2,
    ROUND(ST_Distance(l1.location::geography, l2.location::geography)::numeric, 2) as distance_meters
FROM locations l1
CROSS JOIN locations l2
WHERE l1.category = 'education' 
AND l2.category = 'education'
AND l1.id < l2.id;

-- 3. Find closest restaurant to each university
SELECT DISTINCT ON (l.id)
    l.name as university,
    r.name as closest_restaurant,
    r.cuisine_type,
    ROUND(ST_Distance(l.location::geography, r.location::geography)::numeric, 2) as distance_meters
FROM locations l
CROSS JOIN restaurants r
WHERE l.category = 'education'
ORDER BY l.id, ST_Distance(l.location::geography, r.location::geography);
```

### Exercise 3: Spatial Relationships

```sql
-- Create neighborhoods table
CREATE TABLE neighborhoods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    boundary GEOMETRY(POLYGON, 4326)
);

-- Define 3 Boston neighborhoods as polygons
INSERT INTO neighborhoods (name, boundary) VALUES
('Back Bay', ST_SetSRID(ST_GeomFromText('POLYGON((-71.08 42.34, -71.08 42.36, -71.06 42.36, -71.06 42.34, -71.08 42.34))'), 4326)),
('North End', ST_SetSRID(ST_GeomFromText('POLYGON((-71.06 42.36, -71.06 42.37, -71.04 42.37, -71.04 42.36, -71.06 42.36))'), 4326)),
('Cambridge', ST_SetSRID(ST_GeomFromText('POLYGON((-71.16 42.35, -71.16 42.41, -71.06 42.41, -71.06 42.35, -71.16 42.35))'), 4326));

-- Find which locations fall within each neighborhood
SELECT 
    n.name as neighborhood,
    l.name as location_name,
    l.category
FROM neighborhoods n
JOIN locations l ON ST_Within(l.location, n.boundary);

-- Calculate density of locations per neighborhood
SELECT 
    n.name as neighborhood,
    COUNT(l.id) as location_count,
    ROUND(ST_Area(n.boundary::geography) / 1000000, 2) as area_sqkm,
    ROUND(COUNT(l.id) / (ST_Area(n.boundary::geography) / 1000000), 2) as density_per_sqkm
FROM neighborhoods n
LEFT JOIN locations l ON ST_Within(l.location, n.boundary)
GROUP BY n.id, n.name, n.boundary;
```

### Exercise 4: Buffer Analysis

```sql
-- Create subway stations (simplified)
CREATE TABLE subway_stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    line VARCHAR(50),
    location GEOMETRY(POINT, 4326)
);

INSERT INTO subway_stations (name, line, location) VALUES
('Park Street', 'Red/Green', ST_SetSRID(ST_MakePoint(-71.0624, 42.3560), 4326)),
('Harvard Square', 'Red', ST_SetSRID(ST_MakePoint(-71.1190, 42.3736), 4326)),
('MIT/Kendall', 'Red', ST_SetSRID(ST_MakePoint(-71.0862, 42.3625), 4326));

-- 1. Create 500m and 1km buffers around subway stations
WITH station_buffers AS (
    SELECT 
        name,
        ST_Buffer(location::geography, 500)::geometry as buffer_500m,
        ST_Buffer(location::geography, 1000)::geometry as buffer_1km
    FROM subway_stations
)
SELECT 
    sb.name as station,
    COUNT(CASE WHEN ST_Within(l.location, sb.buffer_500m) THEN 1 END) as locations_500m,
    COUNT(CASE WHEN ST_Within(l.location, sb.buffer_1km) THEN 1 END) as locations_1km
FROM station_buffers sb
CROSS JOIN locations l
GROUP BY sb.name;

-- 2. Find locations within walking distance of public transit
SELECT 
    l.name,
    l.category,
    MIN(ST_Distance(l.location::geography, s.location::geography)) as min_distance_to_transit
FROM locations l
CROSS JOIN subway_stations s
GROUP BY l.id, l.name, l.category
HAVING MIN(ST_Distance(l.location::geography, s.location::geography)) <= 800;
```

### Exercise 5: Route Analysis

```sql
-- Create delivery_points table
CREATE TABLE delivery_points (
    id SERIAL PRIMARY KEY,
    address VARCHAR(200),
    location GEOMETRY(POINT, 4326),
    priority INTEGER DEFAULT 1
);

-- Insert 10 delivery locations
INSERT INTO delivery_points (address, location, priority) VALUES
('100 Beacon St', ST_SetSRID(ST_MakePoint(-71.0656, 42.3551), 4326), 1),
('200 Newbury St', ST_SetSRID(ST_MakePoint(-71.0742, 42.3505), 4326), 2),
('MIT Campus', ST_SetSRID(ST_MakePoint(-71.0942, 42.3601), 4326), 1),
('Harvard Square', ST_SetSRID(ST_MakePoint(-71.1190, 42.3736), 4326), 3),
('Fenway Park', ST_SetSRID(ST_MakePoint(-71.0972, 42.3467), 4326), 2),
('North End', ST_SetSRID(ST_MakePoint(-71.0547, 42.3647), 4326), 1),
('South Station', ST_SetSRID(ST_MakePoint(-71.0552, 42.3519), 4326), 3),
('Copley Square', ST_SetSRID(ST_MakePoint(-71.0770, 42.3496), 4326), 2),
('Quincy Market', ST_SetSRID(ST_MakePoint(-71.0546, 42.3601), 4326), 1),
('Back Bay Station', ST_SetSRID(ST_MakePoint(-71.0752, 42.3473), 4326), 2);

-- Calculate distances between all points
WITH point_distances AS (
    SELECT 
        p1.id as from_id,
        p2.id as to_id,
        p1.address as from_address,
        p2.address as to_address,
        ST_Distance(p1.location::geography, p2.location::geography) as distance_meters
    FROM delivery_points p1
    CROSS JOIN delivery_points p2
    WHERE p1.id != p2.id
)
SELECT 
    from_address,
    to_address,
    ROUND(distance_meters::numeric, 2) as distance_meters,
    ROUND((distance_meters / 1000 * 3)::numeric, 1) as estimated_time_minutes -- 20 km/h average
FROM point_distances
ORDER BY distance_meters;

-- Simplified delivery optimization function
CREATE OR REPLACE FUNCTION optimize_delivery_route()
RETURNS TABLE(
    stop_order INTEGER,
    address VARCHAR(200),
    cumulative_distance NUMERIC
) AS $$
DECLARE
    current_point GEOMETRY;
    total_distance NUMERIC := 0;
    stop_count INTEGER := 1;
BEGIN
    -- Start from first point
    SELECT location INTO current_point FROM delivery_points WHERE id = 1;
    
    RETURN QUERY
    WITH RECURSIVE route_optimization AS (
        -- Base case: start point
        SELECT 1 as stop_order, dp.address, 0::numeric as cumulative_distance, dp.location, ARRAY[dp.id] as visited
        FROM delivery_points dp WHERE id = 1
        
        UNION ALL
        
        -- Recursive case: find nearest unvisited point
        SELECT 
            ro.stop_order + 1,
            dp.address,
            ro.cumulative_distance + ST_Distance(ro.location::geography, dp.location::geography),
            dp.location,
            ro.visited || dp.id
        FROM route_optimization ro
        CROSS JOIN delivery_points dp
        WHERE NOT (dp.id = ANY(ro.visited))
        AND ro.stop_order < 10
        ORDER BY ST_Distance(ro.location::geography, dp.location::geography)
        LIMIT 1
    )
    SELECT ro.stop_order, ro.address, ROUND(ro.cumulative_distance::numeric, 2)
    FROM route_optimization ro;
END;
$$ LANGUAGE plpgsql;
```

### Exercise 6: Spatial Aggregation

```sql
-- Create spatial dashboard view
CREATE VIEW location_dashboard AS
SELECT 
    l.category,
    r.name as region_name,
    COUNT(l.id) as location_count,
    ROUND(AVG(l.rating), 2) as avg_rating,
    ROUND(ST_Area(ST_ConvexHull(ST_Collect(l.location))::geography) / 1000000, 2) as coverage_area_sqkm,
    ST_AsText(ST_Centroid(ST_Collect(l.location))) as geographic_center
FROM locations l
LEFT JOIN regions r ON ST_Within(l.location, r.boundary)
GROUP BY l.category, r.name
HAVING COUNT(l.id) > 0;

-- Create materialized view for performance
CREATE MATERIALIZED VIEW spatial_analytics_mv AS
SELECT 
    category,
    COUNT(*) as location_count,
    ROUND(ST_Area(ST_ConvexHull(ST_Collect(location))::geography) / 1000000, 2) as coverage_area_sqkm,
    ST_AsText(ST_Centroid(ST_Collect(location))) as category_centroid,
    ROUND(AVG(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(-71.0656, 42.3551), 4326)::geography
    ))::numeric, 2) as avg_distance_from_center
FROM locations
GROUP BY category;

CREATE INDEX idx_spatial_analytics_category ON spatial_analytics_mv(category);

-- Query the dashboard
SELECT * FROM location_dashboard ORDER BY location_count DESC;
SELECT * FROM spatial_analytics_mv ORDER BY coverage_area_sqkm DESC;
```

## PostgREST Setup Solutions

### Exercise 1: Basic API Operations

```bash
# 1. Create a new workshop via POST
curl -X POST "http://localhost:3000/workshops" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API Testing Workshop",
    "description": "Learn to test APIs effectively",
    "duration": 180,
    "instructor": "Test Instructor"
  }'

# 2. Update workshop duration using PATCH
curl -X PATCH "http://localhost:3000/workshops?id=eq.1" \
  -H "Content-Type: application/json" \
  -d '{"duration": 200}'

# 3. Query workshops by instructor name
curl "http://localhost:3000/workshops?instructor=eq.John%20Doe"

# 4. Delete the workshop created
curl -X DELETE "http://localhost:3000/workshops?title=eq.API%20Testing%20Workshop"
```

### Exercise 2: Advanced Filtering

```bash
# 1. Find workshops longer than 2 hours (120 minutes)
curl "http://localhost:3000/workshops?duration=gt.120"

# 2. Get workshops created in the last 7 days
curl "http://localhost:3000/workshops?created_at=gte.$(date -d '7 days ago' -I)"

# 3. Find workshops with "PostgREST" in the title
curl "http://localhost:3000/workshops?title=like.*PostgREST*"

# 4. Get workshops ordered by duration (shortest first)
curl "http://localhost:3000/workshops?order=duration.asc"
```

### Exercise 3: Relationships and Joins

```bash
# 1. Get all workshops with their participant count
curl "http://localhost:3000/workshop_stats"

# 2. Find participants registered for "PostgREST Basics"
curl "http://localhost:3000/participants?workshops.title=eq.PostgREST%20Basics&select=*,workshops(title)"

# 3. Get workshops that have more than 1 participant
curl "http://localhost:3000/workshop_stats?participant_count=gt.1"

# 4. List participants with their workshop titles
curl "http://localhost:3000/participants?select=name,email,workshops(title,instructor)"
```

### Exercise 4: Create Custom Views

```sql
-- 1. popular_workshops view
CREATE VIEW popular_workshops AS
SELECT 
    w.*,
    COUNT(p.id) as participant_count
FROM workshops w
LEFT JOIN participants p ON w.id = p.workshop_id
GROUP BY w.id
HAVING COUNT(p.id) > 2;

-- 2. instructor_stats view
CREATE VIEW instructor_stats AS
SELECT 
    instructor as instructor_name,
    COUNT(*) as workshop_count,
    SUM(duration) as total_duration_minutes,
    ROUND(AVG(duration), 2) as avg_duration
FROM workshops
GROUP BY instructor;

-- 3. recent_registrations view
CREATE VIEW recent_registrations AS
SELECT 
    p.*,
    w.title as workshop_title
FROM participants p
JOIN workshops w ON p.workshop_id = w.id
WHERE p.registered_at >= CURRENT_DATE - INTERVAL '30 days';

GRANT SELECT ON popular_workshops TO web_anon;
GRANT SELECT ON instructor_stats TO web_anon;
GRANT SELECT ON recent_registrations TO web_anon;
```

```bash
# Test the views
curl "http://localhost:3000/popular_workshops"
curl "http://localhost:3000/instructor_stats"
curl "http://localhost:3000/recent_registrations"
```

### Exercise 5: Performance Testing

```sql
-- Create 1000 sample workshops
INSERT INTO workshops (title, description, duration, instructor, price, category)
SELECT 
    'Workshop ' || generate_series,
    'Description for workshop ' || generate_series,
    (RANDOM() * 300 + 60)::INTEGER,
    'Instructor ' || (generate_series % 10 + 1),
    (RANDOM() * 500 + 100)::DECIMAL(8,2),
    CASE (generate_series % 3)
        WHEN 0 THEN 'technical'
        WHEN 1 THEN 'business'
        ELSE 'general'
    END
FROM generate_series(1, 1000);

-- Create indexes
CREATE INDEX idx_workshops_category_perf ON workshops(category);
CREATE INDEX idx_workshops_instructor_perf ON workshops(instructor);
CREATE INDEX idx_workshops_duration_perf ON workshops(duration);
```

```bash
# Test pagination with different page sizes
time curl "http://localhost:3000/workshops?limit=10"
time curl "http://localhost:3000/workshops?limit=100"
time curl "http://localhost:3000/workshops?limit=1000"

# Compare with and without column selection
time curl "http://localhost:3000/workshops"
time curl "http://localhost:3000/workshops?select=id,title,duration"
```

## PostgREST Authentication Solutions

### Exercise 1: User Registration and Login

```sql
-- Complete authentication setup
CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgjwt;

-- Create roles
CREATE ROLE web_anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE admin_user NOLOGIN;
CREATE ROLE regular_user NOLOGIN;
CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'workshop_auth_pass';

GRANT web_anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT admin_user TO authenticator;
GRANT regular_user TO authenticator;

-- Create users table
CREATE TABLE auth.users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'regular_user',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Password functions
CREATE OR REPLACE FUNCTION auth.hash_password(password TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN crypt(password, gen_salt('bf', 8));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.verify_password(password TEXT, hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN hash = crypt(password, hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Registration function
CREATE OR REPLACE FUNCTION auth.register_user(
    email TEXT,
    password TEXT,
    user_role TEXT DEFAULT 'regular_user'
)
RETURNS JSON AS $$
DECLARE
    new_user auth.users;
BEGIN
    IF EXISTS (SELECT 1 FROM auth.users WHERE auth.users.email = register_user.email) THEN
        RETURN json_build_object('error', 'Email already exists');
    END IF;
    
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

-- Login function
CREATE OR REPLACE FUNCTION auth.login(email TEXT, password TEXT)
RETURNS JSON AS $$
DECLARE
    user_record auth.users;
    jwt_token TEXT;
BEGIN
    SELECT * INTO user_record
    FROM auth.users
    WHERE auth.users.email = login.email AND active = true;
    
    IF user_record IS NULL OR NOT auth.verify_password(password, user_record.password_hash) THEN
        RETURN json_build_object('error', 'Invalid credentials');
    END IF;
    
    jwt_token := sign(
        json_build_object(
            'role', user_record.role,
            'user_id', user_record.id,
            'email', user_record.email,
            'exp', extract(epoch from now() + interval '7 days')
        ),
        'your-super-secret-jwt-key-at-least-32-characters-long'
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION auth.register_user TO web_anon;
GRANT EXECUTE ON FUNCTION auth.login TO web_anon;
```

```bash
# Register a new user
curl -X POST "http://localhost:3000/rpc/register_user" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securepass123",
    "user_role": "regular_user"
  }'

# Login with the user
curl -X POST "http://localhost:3000/rpc/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securepass123"
  }'

# Test protected endpoint
TOKEN="your-jwt-token-here"
curl "http://localhost:3000/workshops" \
  -H "Authorization: Bearer $TOKEN"
```

### Exercise 2: Role-Based Access Control

```sql
-- Add owner_id to workshops
ALTER TABLE workshops ADD COLUMN owner_id INTEGER REFERENCES auth.users(id);

-- Enable RLS
ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "workshops_select_all" ON workshops FOR SELECT USING (true);

CREATE POLICY "workshops_insert_auth" ON workshops 
FOR INSERT TO authenticated 
WITH CHECK (owner_id = (current_setting('request.jwt.claims', true)::json->>'user_id')::integer);

CREATE POLICY "workshops_update_owner" ON workshops 
FOR UPDATE TO authenticated 
USING (owner_id = (current_setting('request.jwt.claims', true)::json->>'user_id')::integer);

CREATE POLICY "workshops_admin_all" ON workshops 
FOR ALL TO admin_user 
USING (true) WITH CHECK (true);

-- Test with different roles
CREATE OR REPLACE FUNCTION create_test_users()
RETURNS JSON AS $$
BEGIN
    INSERT INTO auth.users (email, password_hash, role) VALUES
    ('admin@test.com', auth.hash_password('admin123'), 'admin_user'),
    ('editor@test.com', auth.hash_password('editor123'), 'authenticated'),
    ('viewer@test.com', auth.hash_password('viewer123'), 'regular_user');
    
    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

SELECT create_test_users();
```

### Exercise 3: JWT Token Management

```sql
-- Refresh token function
CREATE TABLE auth.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION auth.refresh_token(refresh_token_id UUID)
RETURNS JSON AS $$
DECLARE
    token_record auth.refresh_tokens;
    user_record auth.users;
    new_jwt TEXT;
BEGIN
    SELECT * INTO token_record
    FROM auth.refresh_tokens
    WHERE id = refresh_token_id AND expires_at > NOW();
    
    IF token_record IS NULL THEN
        RETURN json_build_object('error', 'Invalid or expired refresh token');
    END IF;
    
    SELECT * INTO user_record
    FROM auth.users
    WHERE id = token_record.user_id AND active = true;
    
    new_jwt := sign(
        json_build_object(
            'role', user_record.role,
            'user_id', user_record.id,
            'email', user_record.email,
            'exp', extract(epoch from now() + interval '7 days')
        ),
        'your-super-secret-jwt-key-at-least-32-characters-long'
    );
    
    RETURN json_build_object('token', new_jwt);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- User profile management
CREATE OR REPLACE FUNCTION auth.update_profile(
    new_email TEXT DEFAULT NULL,
    new_password TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    current_user_id INTEGER;
BEGIN
    current_user_id := (current_setting('request.jwt.claims', true)::json->>'user_id')::integer;
    
    IF current_user_id IS NULL THEN
        RETURN json_build_object('error', 'Authentication required');
    END IF;
    
    UPDATE auth.users
    SET 
        email = COALESCE(new_email, email),
        password_hash = CASE 
            WHEN new_password IS NOT NULL THEN auth.hash_password(new_password)
            ELSE password_hash
        END,
        updated_at = NOW()
    WHERE id = current_user_id;
    
    RETURN json_build_object('success', true, 'message', 'Profile updated');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION auth.refresh_token TO web_anon;
GRANT EXECUTE ON FUNCTION auth.update_profile TO authenticated;
```

## PostgREST Functions Solutions

### Exercise 1: Basic Function Creation

```sql
-- 1. Workshop summary function
CREATE OR REPLACE FUNCTION get_workshop_summary()
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT json_build_object(
            'total_workshops', COUNT(w.id),
            'total_participants', COUNT(p.id),
            'average_rating', ROUND(AVG((f.feedback->>'rating')::numeric), 2),
            'generated_at', NOW()
        )
        FROM workshops w
        LEFT JOIN participants p ON w.id = p.workshop_id
        LEFT JOIN workshop_feedback f ON w.id = f.workshop_id
    );
END;
$$ LANGUAGE plpgsql;

-- 2. Keyword search function
CREATE OR REPLACE FUNCTION find_workshops_by_keyword(keyword TEXT)
RETURNS TABLE(
    id INTEGER,
    title VARCHAR(200),
    description TEXT,
    instructor VARCHAR(100),
    relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id,
        w.title,
        w.description,
        w.instructor,
        ts_rank(
            to_tsvector('english', w.title || ' ' || COALESCE(w.description, '') || ' ' || w.instructor),
            plainto_tsquery('english', keyword)
        ) as relevance
    FROM workshops w
    WHERE to_tsvector('english', w.title || ' ' || COALESCE(w.description, '') || ' ' || w.instructor) 
          @@ plainto_tsquery('english', keyword)
    ORDER BY relevance DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_workshop_summary TO web_anon;
GRANT EXECUTE ON FUNCTION find_workshops_by_keyword TO web_anon;
```

```bash
# Test the functions
curl -X POST "http://localhost:3000/rpc/get_workshop_summary"
curl -X POST "http://localhost:3000/rpc/find_workshops_by_keyword" \
  -H "Content-Type: application/json" \
  -d '{"keyword": "PostgREST"}'
```

### Exercise 2: Table-Returning Functions

```sql
-- 1. Popular workshops function
CREATE OR REPLACE FUNCTION get_popular_workshops(min_participants INTEGER DEFAULT 1)
RETURNS TABLE(
    workshop_id INTEGER,
    title VARCHAR(200),
    instructor VARCHAR(100),
    participant_count BIGINT,
    duration INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id,
        w.title,
        w.instructor,
        COUNT(p.id) as participant_count,
        w.duration
    FROM workshops w
    LEFT JOIN participants p ON w.id = p.workshop_id
    GROUP BY w.id, w.title, w.instructor, w.duration
    HAVING COUNT(p.id) >= min_participants
    ORDER BY COUNT(p.id) DESC;
END;
$$ LANGUAGE plpgsql;

-- 2. Instructor schedule function
CREATE OR REPLACE FUNCTION get_instructor_schedule(instructor_name TEXT)
RETURNS TABLE(
    workshop_title VARCHAR(200),
    duration INTEGER,
    participant_count BIGINT,
    created_at TIMESTAMP
) AS $$
BEGIN
    IF instructor_name IS NULL OR LENGTH(TRIM(instructor_name)) = 0 THEN
        RAISE EXCEPTION 'Instructor name is required';
    END IF;
    
    RETURN QUERY
    SELECT 
        w.title,
        w.duration,
        COUNT(p.id) as participant_count,
        w.created_at
    FROM workshops w
    LEFT JOIN participants p ON w.id = p.workshop_id
    WHERE w.instructor = instructor_name
    GROUP BY w.id, w.title, w.duration, w.created_at
    ORDER BY w.created_at DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_popular_workshops TO web_anon;
GRANT EXECUTE ON FUNCTION get_instructor_schedule TO web_anon;
```

### Exercise 3: Authentication-Aware Functions

```sql
-- 1. User's workshop history
CREATE OR REPLACE FUNCTION my_workshop_history()
RETURNS TABLE(
    workshop_title VARCHAR(200),
    instructor VARCHAR(100),
    duration INTEGER,
    registered_at TIMESTAMP
) AS $$
DECLARE
    current_user_id INTEGER;
BEGIN
    current_user_id := (current_setting('request.jwt.claims', true)::json->>'user_id')::integer;
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    RETURN QUERY
    SELECT 
        w.title,
        w.instructor,
        w.duration,
        p.registered_at
    FROM participants p
    JOIN workshops w ON p.workshop_id = w.id
    WHERE p.user_id = current_user_id
    ORDER BY p.registered_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Register for workshop function
CREATE OR REPLACE FUNCTION register_for_workshop(workshop_id INTEGER)
RETURNS JSON AS $$
DECLARE
    current_user_id INTEGER;
    user_email TEXT;
    user_name TEXT;
BEGIN
    current_user_id := (current_setting('request.jwt.claims', true)::json->>'user_id')::integer;
    
    IF current_user_id IS NULL THEN
        RETURN json_build_object('error', 'Authentication required');
    END IF;
    
    -- Get user details
    SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;
    user_name := SPLIT_PART(user_email, '@', 1);
    
    -- Check if already registered
    IF EXISTS(SELECT 1 FROM participants WHERE workshop_id = register_for_workshop.workshop_id AND user_id = current_user_id) THEN
        RETURN json_build_object('error', 'Already registered for this workshop');
    END IF;
    
    -- Register
    INSERT INTO participants (name, email, workshop_id, user_id)
    VALUES (user_name, user_email, workshop_id, current_user_id);
    
    RETURN json_build_object('success', true, 'message', 'Successfully registered');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Admin user statistics
CREATE OR REPLACE FUNCTION get_user_statistics()
RETURNS JSON AS $$
DECLARE
    current_user_role TEXT;
BEGIN
    current_user_role := current_setting('request.jwt.claims', true)::json->>'role';
    
    IF current_user_role != 'admin_user' THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    
    RETURN (
        SELECT json_build_object(
            'total_users', COUNT(u.id),
            'active_users', COUNT(CASE WHEN u.active THEN 1 END),
            'total_registrations', COUNT(p.id),
            'registrations_last_30_days', COUNT(CASE WHEN p.registered_at > NOW() - INTERVAL '30 days' THEN 1 END)
        )
        FROM auth.users u
        LEFT JOIN participants p ON u.id = p.user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION my_workshop_history TO authenticated;
GRANT EXECUTE ON FUNCTION register_for_workshop TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_statistics TO admin_user;
```

## PostgREST GIS Solutions

### Exercise 1: Spatial Data Setup

```sql
-- Create restaurants table with spatial data
CREATE TABLE restaurants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    cuisine VARCHAR(50),
    rating DECIMAL(2,1) CHECK (rating >= 1 AND rating <= 5),
    location GEOMETRY(POINT, 4326),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create spatial index
CREATE INDEX idx_restaurants_location ON restaurants USING GIST(location);

-- Insert 10 restaurants in Boston area
INSERT INTO restaurants (name, cuisine, rating, location) VALUES
('North End Pizza', 'Italian', 4.5, ST_SetSRID(ST_MakePoint(-71.0547, 42.3647), 4326)),
('Chinatown Express', 'Chinese', 4.2, ST_SetSRID(ST_MakePoint(-71.0603, 42.3505), 4326)),
('Back Bay Bistro', 'French', 4.8, ST_SetSRID(ST_MakePoint(-71.0742, 42.3505), 4326)),
('Cambridge Cafe', 'American', 4.0, ST_SetSRID(ST_MakePoint(-71.1190, 42.3736), 4326)),
('Fenway Grill', 'American', 4.3, ST_SetSRID(ST_MakePoint(-71.0972, 42.3467), 4326)),
('South End Sushi', 'Japanese', 4.6, ST_SetSRID(ST_MakePoint(-71.0723, 42.3467), 4326)),
('Beacon Hill Bakery', 'Bakery', 4.1, ST_SetSRID(ST_MakePoint(-71.0656, 42.3584), 4326)),
('Harvard Square Deli', 'Deli', 3.9, ST_SetSRID(ST_MakePoint(-71.1190, 42.3736), 4326)),
('MIT Food Truck', 'Food Truck', 4.4, ST_SetSRID(ST_MakePoint(-71.0942, 42.3601), 4326)),
('Downtown Donuts', 'Bakery', 3.8, ST_SetSRID(ST_MakePoint(-71.0589, 42.3581), 4326));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON restaurants TO web_anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO web_anon;
```

```bash
# Test basic spatial queries
curl "http://localhost:3000/restaurants?select=id,name,cuisine,rating,location"
curl "http://localhost:3000/restaurants?cuisine=eq.Italian"
```

### Exercise 2: Distance-Based Functions

```sql
-- 1. Find restaurants nearby with cuisine filter
CREATE OR REPLACE FUNCTION find_restaurants_nearby(
    lat DECIMAL,
    lng DECIMAL,
    radius INTEGER DEFAULT 1000,
    cuisine_type TEXT DEFAULT NULL
)
RETURNS TABLE(
    id INTEGER,
    name VARCHAR(100),
    cuisine VARCHAR(50),
    rating DECIMAL,
    distance_meters DECIMAL,
    geometry JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.name,
        r.cuisine,
        r.rating,
        ROUND(ST_Distance(
            r.location::geography,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
        )::numeric, 2) as distance_meters,
        ST_AsGeoJSON(r.location)::json as geometry
    FROM restaurants r
    WHERE ST_DWithin(
        r.location::geography,
        ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
        radius
    )
    AND (cuisine_type IS NULL OR r.cuisine = cuisine_type)
    ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql;

-- 2. Restaurant density by region
CREATE OR REPLACE FUNCTION get_restaurant_density(region_name TEXT)
RETURNS JSON AS $$
DECLARE
    region_geom GEOMETRY;
    result JSON;
BEGIN
    SELECT boundary INTO region_geom
    FROM regions
    WHERE name = region_name;
    
    IF region_geom IS NULL THEN
        RETURN json_build_object('error', 'Region not found');
    END IF;
    
    SELECT json_build_object(
        'region_name', region_name,
        'total_restaurants', COUNT(r.id),
        'restaurants_by_cuisine', json_object_agg(r.cuisine, cuisine_count),
        'average_rating', ROUND(AVG(r.rating), 2),
        'area_sqkm', (SELECT area_sqkm FROM regions WHERE name = region_name),
        'density_per_sqkm', ROUND(COUNT(r.id)::decimal / (SELECT area_sqkm FROM regions WHERE name = region_name), 2)
    ) INTO result
    FROM (
        SELECT 
            r.cuisine,
            COUNT(*) as cuisine_count,
            AVG(r.rating) as avg_rating
        FROM restaurants r
        WHERE ST_Within(r.location, region_geom)
        GROUP BY r.cuisine
    ) r;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 3. Find food deserts
CREATE OR REPLACE FUNCTION find_food_deserts(max_distance INTEGER DEFAULT 1000)
RETURNS TABLE(
    grid_id INTEGER,
    center_point JSON,
    nearest_restaurant_distance DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH grid_points AS (
        SELECT 
            ROW_NUMBER() OVER() as id,
            ST_SetSRID(ST_MakePoint(
                -71.2 + (x * 0.01),
                42.2 + (y * 0.01)
            ), 4326) as point
        FROM generate_series(0, 20) x
        CROSS JOIN generate_series(0, 20) y
    )
    SELECT 
        gp.id::INTEGER,
        ST_AsGeoJSON(gp.point)::json,
        ROUND(MIN(ST_Distance(gp.point::geography, r.location::geography))::numeric, 2)
    FROM grid_points gp
    CROSS JOIN restaurants r
    GROUP BY gp.id, gp.point
    HAVING MIN(ST_Distance(gp.point::geography, r.location::geography)) > max_distance
    ORDER BY MIN(ST_Distance(gp.point::geography, r.location::geography)) DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION find_restaurants_nearby TO web_anon;
GRANT EXECUTE ON FUNCTION get_restaurant_density TO web_anon;
GRANT EXECUTE ON FUNCTION find_food_deserts TO web_anon;
```

### Exercise 3: Spatial Analysis API

```sql
-- Create delivery zones
CREATE TABLE delivery_zones (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    zone_type VARCHAR(50),
    boundary GEOMETRY(POLYGON, 4326),
    delivery_fee DECIMAL(5,2),
    max_delivery_time INTEGER -- minutes
);

INSERT INTO delivery_zones (name, zone_type, boundary, delivery_fee, max_delivery_time) VALUES
('Downtown Zone', 'premium', 
 ST_SetSRID(ST_GeomFromText('POLYGON((-71.08 42.34, -71.08 42.37, -71.04 42.37, -71.04 42.34, -71.08 42.34))'), 4326),
 2.99, 30),
('Cambridge Zone', 'standard',
 ST_SetSRID(ST_GeomFromText('POLYGON((-71.16 42.35, -71.16 42.41, -71.06 42.41, -71.06 42.35, -71.16 42.35))'), 4326),
 4.99, 45),
('Extended Zone', 'extended',
 ST_SetSRID(ST_GeomFromText('POLYGON((-71.20 42.25, -71.20 42.45, -70.95 42.45, -70.95 42.25, -71.20 42.25))'), 4326),
 7.99, 60);

-- 1. Check delivery availability
CREATE OR REPLACE FUNCTION check_delivery_availability(lat DECIMAL, lng DECIMAL)
RETURNS JSON AS $$
DECLARE
    delivery_point GEOMETRY;
    zone_info RECORD;
BEGIN
    delivery_point := ST_SetSRID(ST_MakePoint(lng, lat), 4326);
    
    SELECT * INTO zone_info
    FROM delivery_zones
    WHERE ST_Within(delivery_point, boundary)
    ORDER BY delivery_fee ASC
    LIMIT 1;
    
    IF zone_info IS NULL THEN
        RETURN json_build_object(
            'available', false,
            'message', 'Delivery not available in this area'
        );
    END IF;
    
    RETURN json_build_object(
        'available', true,
        'zone_name', zone_info.name,
        'delivery_fee', zone_info.delivery_fee,
        'estimated_time', zone_info.max_delivery_time,
        'nearby_restaurants', (
            SELECT json_agg(json_build_object(
                'name', r.name,
                'cuisine', r.cuisine,
                'rating', r.rating,
                'distance_meters', ROUND(ST_Distance(r.location::geography, delivery_point::geography)::numeric, 2)
            ))
            FROM restaurants r
            WHERE ST_DWithin(r.location::geography, delivery_point::geography, 2000)
            ORDER BY ST_Distance(r.location::geography, delivery_point::geography)
            LIMIT 5
        )
    );
END;
$$ LANGUAGE plpgsql;

-- 2. Optimize delivery route
CREATE OR REPLACE FUNCTION optimize_delivery_route(
    restaurant_id INTEGER,
    delivery_addresses JSONB
)
RETURNS JSON AS $$
DECLARE
    restaurant_location GEOMETRY;
    address JSONB;
    route_points GEOMETRY[];
    total_distance DECIMAL := 0;
    route_info JSON;
BEGIN
    -- Get restaurant location
    SELECT location INTO restaurant_location
    FROM restaurants
    WHERE id = restaurant_id;
    
    IF restaurant_location IS NULL THEN
        RETURN json_build_object('error', 'Restaurant not found');
    END IF;
    
    -- Build route (simplified nearest neighbor)
    route_points := ARRAY[restaurant_location];
    
    FOR address IN SELECT * FROM jsonb_array_elements(delivery_addresses)
    LOOP
        route_points := array_append(route_points, 
            ST_SetSRID(ST_MakePoint(
                (address->>'lng')::decimal,
                (address->>'lat')::decimal
            ), 4326)
        );
    END LOOP;
    
    -- Calculate total distance
    FOR i IN 1..array_length(route_points, 1)-1
    LOOP
        total_distance := total_distance + ST_Distance(
            route_points[i]::geography,
            route_points[i+1]::geography
        );
    END LOOP;
    
    RETURN json_build_object(
        'restaurant_id', restaurant_id,
        'total_distance_meters', ROUND(total_distance::numeric, 2),
        'estimated_time_minutes', ROUND((total_distance / 1000 * 3)::numeric, 0), -- 20 km/h average
        'delivery_points', jsonb_array_length(delivery_addresses),
        'route_geometry', ST_AsGeoJSON(ST_MakeLine(route_points))::json
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION check_delivery_availability TO web_anon;
GRANT EXECUTE ON FUNCTION optimize_delivery_route TO authenticated;
```

```bash
# Test delivery functions
curl -X POST "http://localhost:3000/rpc/check_delivery_availability" \
  -H "Content-Type: application/json" \
  -d '{"lat": 42.3551, "lng": -71.0656}'

curl -X POST "http://localhost:3000/rpc/optimize_delivery_route" \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_id": 1,
    "delivery_addresses": [
      {"lat": 42.3551, "lng": -71.0656, "address": "Boston Common"},
      {"lat": 42.3736, "lng": -71.1190, "address": "Harvard Square"}
    ]
  }'
```

This comprehensive solutions document provides working code for all exercises across the workshop modules, demonstrating practical implementation of PostgreSQL, PostGIS, and PostgREST concepts with real-world scenarios.