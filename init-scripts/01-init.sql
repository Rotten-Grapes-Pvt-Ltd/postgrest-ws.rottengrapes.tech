-- Create basic roles
CREATE ROLE web_anon NOLOGIN;


-- Create auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- Install required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgjwt;

-- Create workshops table
CREATE TABLE public.workshops (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    location VARCHAR(255),
    max_participants INTEGER DEFAULT 50,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create participants table
CREATE TABLE public.participants (
    id SERIAL PRIMARY KEY,
    workshop_id INTEGER REFERENCES workshops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    registered_at TIMESTAMP DEFAULT NOW()
);

-- Insert dummy workshops
INSERT INTO public.workshops (title, description, start_date, end_date, location, max_participants) VALUES
('PostgreSQL Basics', 'Learn the fundamentals of PostgreSQL', '2024-02-01 09:00:00', '2024-02-01 17:00:00', 'Boston, MA', 30),
('PostGIS Workshop', 'Spatial data with PostGIS', '2024-02-15 09:00:00', '2024-02-15 17:00:00', 'Cambridge, MA', 25),
('PostgREST API Development', 'Build APIs with PostgREST', '2024-03-01 09:00:00', '2024-03-01 17:00:00', 'New York, NY', 40);

-- Insert dummy participants
INSERT INTO public.participants (workshop_id, name, email) VALUES
(1, 'John Doe', 'john@example.com'),
(1, 'Jane Smith', 'jane@example.com'),
(2, 'Bob Johnson', 'bob@example.com'),
(3, 'Alice Brown', 'alice@example.com');

-- Grant basic permissions
GRANT USAGE ON SCHEMA public TO web_anon;
GRANT SELECT ON public.workshops TO web_anon;
GRANT SELECT ON public.participants TO web_anon;
