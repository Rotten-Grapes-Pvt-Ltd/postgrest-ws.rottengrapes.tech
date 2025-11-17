-- PostgREST Workshop Functions
-- Functions will be created during the workshop

-- Simple hello world function for testing
CREATE OR REPLACE FUNCTION public.hello_world(name TEXT DEFAULT 'World')
RETURNS TEXT AS $$
BEGIN
    RETURN 'Hello, ' || name || '!';
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to anonymous users
GRANT EXECUTE ON FUNCTION public.hello_world TO web_anon;