# Using Functions with PostgREST

PostgreSQL functions become RPC (Remote Procedure Call) endpoints in PostgREST, allowing you to implement complex business logic and custom operations.

## Function Basics

### Creating Functions
PostgreSQL functions exposed through PostgREST must:
- Be in a schema that PostgREST can access
- Have appropriate permissions granted
- Return JSON, a table, or a scalar value

### Simple Function Example
```sql
-- Create a simple greeting function
CREATE OR REPLACE FUNCTION hello_world(name TEXT DEFAULT 'World')
RETURNS TEXT AS $$
BEGIN
    RETURN 'Hello, ' || name || '!';
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION hello_world TO web_anon;
```

### Calling Functions via PostgREST
```bash
# Call function with parameter
curl -X POST "http://localhost:3000/rpc/hello_world" \
  -H "Content-Type: application/json" \
  -d '{"name": "PostgREST"}'

# Response: "Hello, PostgREST!"
```

## Function Types and Return Values

### Scalar Return Values
```sql
-- Function returning a number
CREATE OR REPLACE FUNCTION calculate_workshop_total_duration()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT SUM(duration) FROM workshops);
END;
$$ LANGUAGE plpgsql;

-- Function returning JSON
CREATE OR REPLACE FUNCTION workshop_statistics()
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'total_workshops', (SELECT COUNT(*) FROM workshops),
        'total_duration', (SELECT SUM(duration) FROM workshops),
        'average_duration', (SELECT AVG(duration) FROM workshops),
        'instructors', (SELECT COUNT(DISTINCT instructor) FROM workshops)
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_workshop_total_duration TO web_anon;
GRANT EXECUTE ON FUNCTION workshop_statistics TO web_anon;
```

### Table-Returning Functions
```sql
-- Function returning a table
CREATE OR REPLACE FUNCTION workshops_by_instructor(instructor_name TEXT)
RETURNS TABLE(
    id INTEGER,
    title VARCHAR(200),
    duration INTEGER,
    participant_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id,
        w.title,
        w.duration,
        COUNT(p.id) as participant_count
    FROM workshops w
    LEFT JOIN participants p ON w.id = p.workshop_id
    WHERE w.instructor = instructor_name
    GROUP BY w.id, w.title, w.duration;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION workshops_by_instructor TO web_anon;
```

### Calling Table Functions
```bash
# Call table-returning function
curl -X POST "http://localhost:3000/rpc/workshops_by_instructor" \
  -H "Content-Type: application/json" \
  -d '{"instructor_name": "John Doe"}'
```

## Advanced Function Patterns

### Data Validation Functions
```sql
-- Function to validate workshop data
CREATE OR REPLACE FUNCTION validate_workshop(
    title TEXT,
    duration INTEGER,
    instructor TEXT
)
RETURNS JSON AS $$
DECLARE
    errors TEXT[] := '{}';
BEGIN
    -- Validate title
    IF title IS NULL OR LENGTH(TRIM(title)) = 0 THEN
        errors := array_append(errors, 'Title is required');
    END IF;
    
    IF LENGTH(title) > 200 THEN
        errors := array_append(errors, 'Title must be 200 characters or less');
    END IF;
    
    -- Validate duration
    IF duration IS NULL OR duration <= 0 THEN
        errors := array_append(errors, 'Duration must be a positive number');
    END IF;
    
    IF duration > 480 THEN -- 8 hours max
        errors := array_append(errors, 'Duration cannot exceed 480 minutes');
    END IF;
    
    -- Validate instructor
    IF instructor IS NULL OR LENGTH(TRIM(instructor)) = 0 THEN
        errors := array_append(errors, 'Instructor is required');
    END IF;
    
    -- Return validation result
    IF array_length(errors, 1) > 0 THEN
        RETURN json_build_object(
            'valid', false,
            'errors', errors
        );
    ELSE
        RETURN json_build_object('valid', true);
    END IF;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION validate_workshop TO web_anon;
```

### Batch Operations
```sql
-- Function to register multiple participants
CREATE OR REPLACE FUNCTION batch_register_participants(
    workshop_id INTEGER,
    participants JSONB
)
RETURNS JSON AS $$
DECLARE
    participant JSONB;
    success_count INTEGER := 0;
    error_count INTEGER := 0;
    errors JSONB[] := '{}';
BEGIN
    -- Loop through participants
    FOR participant IN SELECT * FROM jsonb_array_elements(participants)
    LOOP
        BEGIN
            INSERT INTO participants (name, email, workshop_id)
            VALUES (
                participant->>'name',
                participant->>'email',
                batch_register_participants.workshop_id
            );
            success_count := success_count + 1;
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            errors := array_append(errors, json_build_object(
                'participant', participant,
                'error', SQLERRM
            )::jsonb);
        END;
    END LOOP;
    
    RETURN json_build_object(
        'success_count', success_count,
        'error_count', error_count,
        'errors', errors
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION batch_register_participants TO authenticated;
```

### Search Functions
```sql
-- Full-text search function
CREATE OR REPLACE FUNCTION search_workshops(search_term TEXT)
RETURNS TABLE(
    id INTEGER,
    title VARCHAR(200),
    description TEXT,
    instructor VARCHAR(100),
    duration INTEGER,
    relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id,
        w.title,
        w.description,
        w.instructor,
        w.duration,
        ts_rank(
            to_tsvector('english', w.title || ' ' || COALESCE(w.description, '') || ' ' || w.instructor),
            plainto_tsquery('english', search_term)
        ) as relevance
    FROM workshops w
    WHERE to_tsvector('english', w.title || ' ' || COALESCE(w.description, '') || ' ' || w.instructor) 
          @@ plainto_tsquery('english', search_term)
    ORDER BY relevance DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION search_workshops TO web_anon;
```

## Functions with Authentication Context

### User-Specific Functions
```sql
-- Function to get current user's registrations
CREATE OR REPLACE FUNCTION my_registrations()
RETURNS TABLE(
    workshop_title VARCHAR(200),
    workshop_duration INTEGER,
    instructor VARCHAR(100),
    registered_at TIMESTAMP
) AS $$
DECLARE
    current_user_id INTEGER;
BEGIN
    -- Get current user ID from JWT
    current_user_id := (current_setting('request.jwt.claims', true)::json->>'user_id')::integer;
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    RETURN QUERY
    SELECT 
        w.title,
        w.duration,
        w.instructor,
        p.registered_at
    FROM participants p
    JOIN workshops w ON p.workshop_id = w.id
    WHERE p.user_id = current_user_id
    ORDER BY p.registered_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION my_registrations TO authenticated;
```

### Admin Functions
```sql
-- Function to get user activity report (admin only)
CREATE OR REPLACE FUNCTION user_activity_report(
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    user_email VARCHAR(255),
    registrations_count BIGINT,
    last_activity TIMESTAMP
) AS $$
DECLARE
    current_user_role TEXT;
BEGIN
    -- Check if user is admin
    current_user_role := current_setting('request.jwt.claims', true)::json->>'role';
    
    IF current_user_role != 'admin_user' THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    
    RETURN QUERY
    SELECT 
        u.email,
        COUNT(p.id) as registrations_count,
        MAX(p.registered_at) as last_activity
    FROM auth.users u
    LEFT JOIN participants p ON u.id = p.user_id 
        AND p.registered_at BETWEEN start_date AND end_date
    GROUP BY u.id, u.email
    ORDER BY registrations_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION user_activity_report TO admin_user;
```

## Error Handling in Functions

### Custom Exception Handling
```sql
CREATE OR REPLACE FUNCTION register_for_workshop(
    workshop_id INTEGER,
    participant_name TEXT,
    participant_email TEXT
)
RETURNS JSON AS $$
DECLARE
    workshop_exists BOOLEAN;
    current_user_id INTEGER;
BEGIN
    -- Get current user
    current_user_id := (current_setting('request.jwt.claims', true)::json->>'user_id')::integer;
    
    IF current_user_id IS NULL THEN
        RETURN json_build_object('error', 'Authentication required');
    END IF;
    
    -- Check if workshop exists
    SELECT EXISTS(SELECT 1 FROM workshops WHERE id = workshop_id) INTO workshop_exists;
    
    IF NOT workshop_exists THEN
        RETURN json_build_object('error', 'Workshop not found');
    END IF;
    
    -- Check if already registered
    IF EXISTS(SELECT 1 FROM participants WHERE workshop_id = register_for_workshop.workshop_id AND user_id = current_user_id) THEN
        RETURN json_build_object('error', 'Already registered for this workshop');
    END IF;
    
    -- Register participant
    BEGIN
        INSERT INTO participants (name, email, workshop_id, user_id)
        VALUES (participant_name, participant_email, workshop_id, current_user_id);
        
        RETURN json_build_object(
            'success', true,
            'message', 'Successfully registered for workshop'
        );
    EXCEPTION 
        WHEN unique_violation THEN
            RETURN json_build_object('error', 'Email already registered for this workshop');
        WHEN OTHERS THEN
            RETURN json_build_object('error', 'Registration failed: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION register_for_workshop TO authenticated;
```

## Performance Optimization

### Using Prepared Statements
```sql
-- Function with prepared statement for better performance
CREATE OR REPLACE FUNCTION get_workshops_by_duration_range(
    min_duration INTEGER,
    max_duration INTEGER
)
RETURNS TABLE(
    id INTEGER,
    title VARCHAR(200),
    duration INTEGER,
    instructor VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY EXECUTE 
        'SELECT id, title, duration, instructor FROM workshops WHERE duration BETWEEN $1 AND $2 ORDER BY duration'
    USING min_duration, max_duration;
END;
$$ LANGUAGE plpgsql;
```

### Caching Results
```sql
-- Function with simple caching mechanism
CREATE TABLE IF NOT EXISTS function_cache (
    cache_key TEXT PRIMARY KEY,
    cache_value JSONB,
    expires_at TIMESTAMP
);

CREATE OR REPLACE FUNCTION cached_workshop_stats()
RETURNS JSON AS $$
DECLARE
    cache_key TEXT := 'workshop_stats';
    cached_result JSONB;
    result JSON;
BEGIN
    -- Check cache
    SELECT cache_value INTO cached_result
    FROM function_cache
    WHERE function_cache.cache_key = cached_workshop_stats.cache_key
      AND expires_at > NOW();
    
    IF cached_result IS NOT NULL THEN
        RETURN cached_result::json;
    END IF;
    
    -- Calculate fresh stats
    SELECT json_build_object(
        'total_workshops', COUNT(*),
        'total_duration', SUM(duration),
        'average_duration', AVG(duration),
        'generated_at', NOW()
    ) INTO result
    FROM workshops;
    
    -- Cache result for 1 hour
    INSERT INTO function_cache (cache_key, cache_value, expires_at)
    VALUES (cache_key, result::jsonb, NOW() + INTERVAL '1 hour')
    ON CONFLICT (cache_key) DO UPDATE SET
        cache_value = EXCLUDED.cache_value,
        expires_at = EXCLUDED.expires_at;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;
```

## Testing Functions

### Unit Testing with pgTAP
```sql
-- Install pgTAP extension
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Test function
CREATE OR REPLACE FUNCTION test_hello_world()
RETURNS SETOF TEXT AS $$
BEGIN
    RETURN NEXT is(
        hello_world('Test'),
        'Hello, Test!',
        'hello_world should return correct greeting'
    );
    
    RETURN NEXT is(
        hello_world(),
        'Hello, World!',
        'hello_world should use default parameter'
    );
END;
$$ LANGUAGE plpgsql;
```

### Integration Testing
```bash
# Test function via API
curl -X POST "http://localhost:3000/rpc/workshop_statistics" | jq .

# Test with parameters
curl -X POST "http://localhost:3000/rpc/search_workshops" \
  -H "Content-Type: application/json" \
  -d '{"search_term": "PostgREST"}' | jq .
```

## Best Practices

1. **Use SECURITY DEFINER carefully** - Only when necessary for privilege escalation
2. **Validate inputs** - Always check parameters before processing
3. **Handle exceptions** - Provide meaningful error messages
4. **Use appropriate return types** - JSON for complex data, tables for sets
5. **Grant minimal permissions** - Only to roles that need access
6. **Document functions** - Use comments to explain complex logic
7. **Test thoroughly** - Unit and integration tests
8. **Consider performance** - Use indexes and optimize queries

## Exercises

### Exercise 1: Basic Function Creation
1. Create a function `get_workshop_summary()` that returns total workshops, participants, and average rating
2. Create a function `find_workshops_by_keyword(keyword TEXT)` for searching
3. Test both functions via PostgREST API

```sql
-- Your functions here
```

```bash
# Your API tests here
```

### Exercise 2: Table-Returning Functions
1. Create `get_popular_workshops(min_participants INTEGER)` returning workshops with participant counts
2. Create `get_instructor_schedule(instructor_name TEXT)` showing all workshops for an instructor
3. Add proper error handling and validation

```sql
-- Your functions here
```

### Exercise 3: Authentication-Aware Functions
1. Create `my_workshop_history()` showing current user's past workshops
2. Create `register_for_workshop(workshop_id INTEGER)` with user context
3. Create admin-only function `get_user_statistics()`

```sql
-- Your functions here
```

### Exercise 4: Complex Business Logic
1. Create `calculate_workshop_revenue()` with detailed breakdown
2. Create `suggest_workshops(user_preferences JSONB)` recommendation engine
3. Create `batch_update_workshop_status(workshop_ids INTEGER[], new_status TEXT)`

```sql
-- Your functions here
```

### Exercise 5: Performance and Caching
1. Create a caching mechanism for expensive calculations
2. Implement a function that uses prepared statements
3. Create performance benchmarks comparing cached vs non-cached functions
4. Add function monitoring and logging

```sql
-- Your optimized functions here
```

```bash
# Your performance tests here
```

## Next Steps

Now that you understand how to use functions with PostgREST, let's explore how to combine PostgREST with PostGIS for spatial data APIs.