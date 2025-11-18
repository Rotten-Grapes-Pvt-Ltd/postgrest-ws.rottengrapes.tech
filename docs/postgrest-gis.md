# GIS with PostgREST

Combining PostgREST with PostGIS creates powerful spatial APIs that can handle geographic data and spatial operations through REST endpoints.

## Overview of Spatial Operations

This module covers comprehensive spatial functionality organized into key areas:

### **Setting Up Spatial Data**
Establishes the foundation for spatial operations by creating tables with geometry columns, spatial indexes, and sample geographic data. This section shows how to properly structure spatial databases for optimal performance.

### **Distance-Based Queries**
Implements location-based searches using accurate geographic calculations. These functions find locations within specified distances or return the nearest neighbors to a point - essential for "find nearby" features in applications.

### **Spatial Containment Operations**
Determines spatial relationships like "what's inside what" using polygon boundaries. Critical for geofencing, administrative boundary queries, and determining if points fall within service areas.

### **Spatial Aggregation Functions**
Combines and analyzes multiple spatial features to generate statistics, density metrics, and dashboard-style analytics. Groups spatial data by regions and categories for business intelligence.

### **Buffer Operations**
Creates zones or service areas around geographic features. Used for delivery zones, impact analysis, and determining coverage areas around points of interest.

### **Route and Path Functions**
Handles linear geographic features like roads, trails, and transportation routes. Includes intersection analysis to determine which routes pass through specific regions.

### **Import/Export Operations**
Manages large-scale spatial data integration with support for standard formats like GeoJSON. Includes bulk loading and extraction capabilities for data interchange.

### **Performance Optimization**
Covers spatial indexing strategies, query optimization, and performance monitoring for production spatial applications.

## Real-World Applications

These spatial operations enable:
- **Location Services** - Find nearby restaurants, gas stations, points of interest
- **Geofencing** - Determine if users are in delivery zones or restricted areas
- **Route Planning** - Calculate optimal paths and analyze transportation networks
- **Analytics Dashboards** - Aggregate spatial data for business intelligence
- **Data Integration** - Import/export geographic data from various sources

## Setting Up Spatial Data

### Create Spatial Tables
```sql
-- Create locations table with spatial data
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    location GEOMETRY(POINT, 4326), -- WGS84 coordinates
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create spatial index
CREATE INDEX idx_locations_geom ON locations USING GIST(location);

-- Create regions table for polygonal data
CREATE TABLE regions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    region_type VARCHAR(50), -- city, state, country, etc.
    boundary GEOMETRY(POLYGON, 4326),
    area_sqkm DECIMAL(10,2),
    population INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_regions_boundary ON regions USING GIST(boundary);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON locations TO web_anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON regions TO web_anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO web_anon;
```

### Insert Sample Spatial Data
```sql
-- Insert sample locations
INSERT INTO locations (name, description, category, location) VALUES
('Boston Common', 'Historic public park in downtown Boston', 'park', 
 ST_SetSRID(ST_MakePoint(-71.065, 42.355), 4326)),
('Harvard University', 'Prestigious university in Cambridge', 'education',
 ST_SetSRID(ST_MakePoint(-71.119, 42.373), 4326)),
('MIT', 'Massachusetts Institute of Technology', 'education',
 ST_SetSRID(ST_MakePoint(-71.092, 42.360), 4326)),
('Fenway Park', 'Home of the Boston Red Sox', 'sports',
 ST_SetSRID(ST_MakePoint(-71.097, 42.347), 4326));

-- Insert sample regions
INSERT INTO regions (name, region_type, boundary, area_sqkm, population) VALUES
('Cambridge', 'city', 
 ST_SetSRID(ST_GeomFromText('POLYGON((-71.16 42.35, -71.16 42.40, -71.06 42.40, -71.06 42.35, -71.16 42.35))'), 4326),
 18.5, 118000),
('Boston', 'city',
 ST_SetSRID(ST_GeomFromText('POLYGON((-71.20 42.25, -71.20 42.40, -70.95 42.40, -70.95 42.25, -71.20 42.25))'), 4326),
 232.1, 695000);
```

## Basic Spatial Queries via REST

### Get All Locations with Coordinates
```bash
# Get locations with geometry as GeoJSON
curl "http://localhost:3000/locations" \
  -H "Accept: application/geo+json"

# Get locations with geometry as GeoJSON
curl "http://localhost:3000/locations?select=id,name,category,location"
```

### Custom Spatial Views
```sql
-- Create view with GeoJSON output for geometry
CREATE VIEW locations_geojson AS
SELECT 
    id,
    name,
    description,
    category,
    ST_AsGeoJSON(location)::json as geometry,
    created_at
FROM locations;

-- Grant permissions
GRANT SELECT ON locations_geojson TO web_anon;
```

```bash
# Query the GeoJSON view
curl "http://localhost:3000/locations_geojson"
```

## Spatial Functions for PostgREST

### Distance-Based Queries
```sql
-- Function to find locations within distance
CREATE OR REPLACE FUNCTION locations_within_distance(
    center_lng DECIMAL,
    center_lat DECIMAL,
    distance_meters INTEGER DEFAULT 1000
)
RETURNS TABLE(
    id INTEGER,
    name VARCHAR(100),
    category VARCHAR(50),
    distance DECIMAL,
    geometry JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.name,
        l.category,
        ST_Distance(
            ST_Transform(l.location, 3857),
            ST_Transform(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326), 3857)
        )::DECIMAL as distance_meters,
        ST_AsGeoJSON(l.location)::json as geometry
    FROM locations l
    WHERE ST_DWithin(
        ST_Transform(l.location, 3857),
        ST_Transform(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326), 3857),
        distance_meters
    )
    ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION locations_within_distance TO web_anon;
```

### Nearest Neighbor Function
```sql
-- Function to find nearest locations
CREATE OR REPLACE FUNCTION nearest_locations(
    center_lng DECIMAL,
    center_lat DECIMAL,
    limit_count INTEGER DEFAULT 5
)
RETURNS TABLE(
    id INTEGER,
    name VARCHAR(100),
    category VARCHAR(50),
    distance_meters DECIMAL,
    geometry JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.name,
        l.category,
        ST_Distance(
            ST_Transform(l.location, 3857),
            ST_Transform(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326), 3857)
        )::DECIMAL as distance_meters,
        ST_AsGeoJSON(l.location)::json as geometry
    FROM locations l
    ORDER BY l.location <-> ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nearest_locations TO web_anon;
```

### Spatial Containment Function
```sql
-- Function to find locations within a region
CREATE OR REPLACE FUNCTION locations_in_region(region_name TEXT)
RETURNS TABLE(
    location_id INTEGER,
    location_name VARCHAR(100),
    location_category VARCHAR(50),
    region VARCHAR(100),
    geometry JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.name,
        l.category,
        r.name,
        ST_AsGeoJSON(l.location)::json as geometry
    FROM locations l, regions r
    WHERE r.name = region_name
      AND ST_Within(l.location, r.boundary);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION locations_in_region TO web_anon;
```

## Using Spatial Functions

### Find Nearby Locations
```bash
# Find locations within 2000 meters of a point
curl -X POST "http://localhost:3000/rpc/locations_within_distance" \
  -H "Content-Type: application/json" \
  -d '{
    "center_lng": -71.065,
    "center_lat": 42.355,
    "distance_meters": 2000
  }'
```

### Find Nearest Locations
```bash
# Find 3 nearest locations
curl -X POST "http://localhost:3000/rpc/nearest_locations" \
  -H "Content-Type: application/json" \
  -d '{
    "center_lng": -71.065,
    "center_lat": 42.355,
    "limit_count": 3
  }'
```

### Find Locations in Region
```bash
# Find all locations in Cambridge
curl -X POST "http://localhost:3000/rpc/locations_in_region" \
  -H "Content-Type: application/json" \
  -d '{"region_name": "Cambridge"}'
```

## Advanced Spatial Operations

This section demonstrates sophisticated spatial analysis capabilities that go beyond basic distance and containment queries.

### Spatial Aggregation Functions

**Purpose**: Combines multiple spatial features to generate comprehensive statistics and analytics for regions.

**What it does**: 
- Counts locations by category within polygon boundaries
- Calculates area measurements and center points
- Groups spatial data for dashboard-style reporting
- Provides density metrics for business intelligence

**Use cases**: Regional analysis, market research, resource planning, demographic studies
```sql
-- Function to get region statistics
CREATE OR REPLACE FUNCTION region_statistics(region_name TEXT)
RETURNS JSON AS $$
DECLARE
    region_geom GEOMETRY;
    result JSON;
BEGIN
    -- Get region geometry
    SELECT boundary INTO region_geom
    FROM regions
    WHERE name = region_name;
    
    IF region_geom IS NULL THEN
        RETURN json_build_object('error', 'Region not found');
    END IF;
    
    -- Calculate statistics
    SELECT json_build_object(
        'region_name', region_name,
        'total_locations', COUNT(l.id),
        'locations_by_category', json_object_agg(l.category, category_count),
        'area_sqkm', (SELECT area_sqkm FROM regions WHERE name = region_name),
        'center_point', ST_AsGeoJSON(ST_Centroid(region_geom))::json
    ) INTO result
    FROM (
        SELECT 
            l.category,
            COUNT(*) as category_count
        FROM locations l
        WHERE ST_Within(l.location, region_geom)
        GROUP BY l.category
    ) l;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION region_statistics TO web_anon;
```

### Spatial Buffer Operations

**Purpose**: Creates circular zones or service areas around geographic points for proximity analysis.

**What it does**:
- Generates buffer zones at specified distances around locations
- Calculates accurate areas using projected coordinate systems
- Returns results as GeoJSON for mapping applications
- Supports variable buffer sizes for different analysis needs

**Use cases**: Service area analysis, delivery zones, impact assessment, coverage planning
```sql
-- Function to create buffer around location
CREATE OR REPLACE FUNCTION location_buffer(
    location_id INTEGER,
    buffer_meters INTEGER DEFAULT 500
)
RETURNS JSON AS $$
DECLARE
    location_geom GEOMETRY;
    buffer_geom GEOMETRY;
BEGIN
    -- Get location geometry
    SELECT location INTO location_geom
    FROM locations
    WHERE id = location_id;
    
    IF location_geom IS NULL THEN
        RETURN json_build_object('error', 'Location not found');
    END IF;
    
    -- Create buffer in Web Mercator for accurate distance
    buffer_geom := ST_Transform(
        ST_Buffer(
            ST_Transform(location_geom, 3857),
            buffer_meters
        ),
        4326
    );
    
    RETURN json_build_object(
        'location_id', location_id,
        'buffer_meters', buffer_meters,
        'buffer_geometry', ST_AsGeoJSON(buffer_geom)::json,
        'buffer_area_sqm', ST_Area(ST_Transform(buffer_geom, 3857))
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION location_buffer TO web_anon;
```

### Route and Path Functions

**Purpose**: Manages linear geographic features and analyzes their relationships with other spatial data.

**What it does**:
- Stores and queries transportation routes, trails, and linear paths
- Finds routes that intersect with specific regions or boundaries
- Analyzes network connectivity and accessibility
- Supports route planning and logistics applications

**Use cases**: Transportation planning, logistics optimization, trail management, utility network analysis
```sql
-- Create routes table
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    description TEXT,
    path GEOMETRY(LINESTRING, 4326),
    distance_km DECIMAL(8,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_routes_path ON routes USING GIST(path);

-- Function to find routes intersecting with a region
CREATE OR REPLACE FUNCTION routes_through_region(region_name TEXT)
RETURNS TABLE(
    route_id INTEGER,
    route_name VARCHAR(100),
    distance_km DECIMAL(8,2),
    geometry JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.name,
        r.distance_km,
        ST_AsGeoJSON(r.path)::json as geometry
    FROM routes r, regions reg
    WHERE reg.name = region_name
      AND ST_Intersects(r.path, reg.boundary);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION routes_through_region TO web_anon;
```

## Spatial Data Import/Export

Handles large-scale spatial data integration with robust error handling and standard format support.

### Bulk Import Function

**Purpose**: Efficiently loads large volumes of geographic data from external sources.

**What it does**:
- Processes GeoJSON FeatureCollections with multiple geographic features
- Validates geometries and handles import errors gracefully
- Provides detailed success/failure reporting
- Supports batch processing for performance

**Use cases**: Data migration, third-party data integration, bulk updates, initial system setup
```sql
-- Function to import GeoJSON features
CREATE OR REPLACE FUNCTION import_geojson_locations(geojson_data JSONB)
RETURNS JSON AS $$
DECLARE
    feature JSONB;
    success_count INTEGER := 0;
    error_count INTEGER := 0;
    errors JSONB[] := '{}';
BEGIN
    -- Process each feature
    FOR feature IN SELECT * FROM jsonb_array_elements(geojson_data->'features')
    LOOP
        BEGIN
            INSERT INTO locations (name, description, category, location)
            VALUES (
                feature->'properties'->>'name',
                feature->'properties'->>'description',
                feature->'properties'->>'category',
                ST_SetSRID(ST_GeomFromGeoJSON(feature->'geometry'), 4326)
            );
            success_count := success_count + 1;
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            errors := array_append(errors, json_build_object(
                'feature', feature,
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

GRANT EXECUTE ON FUNCTION import_geojson_locations TO authenticated;
```

### Export Function

**Purpose**: Extracts spatial data in web-ready formats for external consumption.

**What it does**:
- Exports data as GeoJSON FeatureCollections (web mapping standard)
- Supports filtering by category, bounding box, and other criteria
- Creates properly formatted geographic data for APIs and applications
- Enables data sharing and integration with external systems

**Use cases**: API data feeds, map visualization, data sharing, backup/archival, third-party integrations
```sql
-- Function to export locations as GeoJSON FeatureCollection
CREATE OR REPLACE FUNCTION export_locations_geojson(
    category_filter TEXT DEFAULT NULL,
    bbox_minx DECIMAL DEFAULT NULL,
    bbox_miny DECIMAL DEFAULT NULL,
    bbox_maxx DECIMAL DEFAULT NULL,
    bbox_maxy DECIMAL DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    bbox_geom GEOMETRY;
BEGIN
    -- Create bounding box geometry if provided
    IF bbox_minx IS NOT NULL AND bbox_miny IS NOT NULL AND 
       bbox_maxx IS NOT NULL AND bbox_maxy IS NOT NULL THEN
        bbox_geom := ST_MakeEnvelope(bbox_minx, bbox_miny, bbox_maxx, bbox_maxy, 4326);
    END IF;
    
    RETURN (
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(
                json_build_object(
                    'type', 'Feature',
                    'id', id,
                    'geometry', ST_AsGeoJSON(location)::json,
                    'properties', json_build_object(
                        'name', name,
                        'description', description,
                        'category', category,
                        'created_at', created_at
                    )
                )
            )
        )
        FROM locations
        WHERE (category_filter IS NULL OR category = category_filter)
          AND (bbox_geom IS NULL OR ST_Intersects(location, bbox_geom))
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION export_locations_geojson TO web_anon;
```

## Spatial Indexing and Performance

Critical for production spatial applications handling large datasets and high query volumes.

### Optimizing Spatial Queries

**Purpose**: Ensures fast spatial query performance through proper indexing strategies.

**What it does**:
- Creates specialized spatial indexes (GiST) for geometry columns
- Implements partial indexes for common query patterns
- Provides query performance analysis tools
- Optimizes for specific use cases and data access patterns

**Key concepts**:
- **GiST Indexes**: R-tree structures optimized for spatial data
- **Partial Indexes**: Indexes on subsets of data for specific queries
- **Query Planning**: Understanding how PostgreSQL executes spatial queries
```sql
-- Create partial indexes for common queries
CREATE INDEX idx_locations_category_geom ON locations USING GIST(location) 
WHERE category = 'education';

CREATE INDEX idx_locations_recent_geom ON locations USING GIST(location)
WHERE created_at > CURRENT_DATE - INTERVAL '30 days';

-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS) 
SELECT name FROM locations 
WHERE ST_DWithin(
    ST_Transform(location, 3857),
    ST_Transform(ST_SetSRID(ST_MakePoint(-71.065, 42.355), 4326), 3857),
    1000
);
```

### Spatial Statistics Function
```sql
-- Function to get spatial index statistics
CREATE OR REPLACE FUNCTION spatial_index_stats()
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'locations_count', (SELECT COUNT(*) FROM locations),
        'regions_count', (SELECT COUNT(*) FROM regions),
        'spatial_indexes', json_build_array(
            json_build_object(
                'table', 'locations',
                'index', 'idx_locations_geom',
                'size', pg_size_pretty(pg_relation_size('idx_locations_geom'))
            ),
            json_build_object(
                'table', 'regions',
                'index', 'idx_regions_boundary',
                'size', pg_size_pretty(pg_relation_size('idx_regions_boundary'))
            )
        )
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION spatial_index_stats TO web_anon;
```

## Real-World Examples

### Location-Based Search API
```bash
# Search for educational institutions near a point
curl -X POST "http://localhost:3000/rpc/locations_within_distance" \
  -H "Content-Type: application/json" \
  -d '{
    "center_lng": -71.065,
    "center_lat": 42.355,
    "distance_meters": 5000
  }' | jq '.[] | select(.category == "education")'
```

### Geofencing API
```bash
# Check if a point is within Cambridge
curl -X POST "http://localhost:3000/rpc/locations_in_region" \
  -H "Content-Type: application/json" \
  -d '{"region_name": "Cambridge"}'
```

### Spatial Analytics API
```bash
# Get statistics for Boston region
curl -X POST "http://localhost:3000/rpc/region_statistics" \
  -H "Content-Type: application/json" \
  -d '{"region_name": "Boston"}'
```

## Best Practices

1. **Use appropriate coordinate systems** - WGS84 (4326) for storage, projected systems for calculations
2. **Create spatial indexes** - Essential for performance on geometry columns
3. **Validate geometries** - Use ST_IsValid() to ensure data quality
4. **Use ST_Transform for distance calculations** - Convert to appropriate projected coordinate system
5. **Optimize queries** - Use ST_DWithin instead of ST_Distance for proximity queries
6. **Consider data size** - Use ST_Simplify for large polygons when appropriate
7. **Monitor performance** - Use EXPLAIN ANALYZE for spatial queries
8. **Cache expensive calculations** - Store computed values like area, length when possible

## Integration with Frontend

### Leaflet.js Example
```javascript
// Fetch locations and display on map
async function loadNearbyLocations(lat, lng, distance = 1000) {
    const response = await fetch('/rpc/locations_within_distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            center_lng: lng,
            center_lat: lat,
            distance_meters: distance
        })
    });
    
    const locations = await response.json();
    
    locations.forEach(location => {
        const coords = location.geometry.coordinates;
        L.marker([coords[1], coords[0]])
            .bindPopup(`<b>${location.name}</b><br>${location.category}`)
            .addTo(map);
    });
}
```

## Exercises

### Exercise 1: Spatial Data Setup
1. Create a `restaurants` table with spatial data (name, cuisine, rating, location)
2. Insert 10 restaurants in the Boston area with real coordinates
3. Create appropriate spatial indexes
4. Test basic spatial queries via PostgREST

```sql
-- Your spatial table setup here
```

```bash
# Your API tests here
```

### Exercise 2: Distance-Based Functions
1. Create `find_restaurants_nearby(lat, lng, radius, cuisine_type)` function
2. Create `get_restaurant_density(region_name)` function
3. Create `find_food_deserts(max_distance)` function to find areas with no restaurants

```sql
-- Your spatial functions here
```

### Exercise 3: Spatial Analysis API
1. Create delivery zones as polygons
2. Build `check_delivery_availability(lat, lng)` function
3. Create `optimize_delivery_route(restaurant_id, delivery_addresses)` function
4. Add real-time location tracking capabilities

```sql
-- Your delivery system here
```

### Exercise 4: GeoJSON Import/Export
1. Create functions to import restaurant data from GeoJSON
2. Build export functions with filtering (by cuisine, rating, distance)
3. Create a bulk update function for restaurant locations
4. Add data validation for imported geometries

```sql
-- Your import/export functions here
```

### Exercise 5: Advanced Spatial Features
1. Create a heat map API showing restaurant density
2. Build spatial clustering for restaurant recommendations
3. Create walking/driving time calculations using external APIs
4. Implement geofencing for restaurant promotions

```sql
-- Your advanced spatial features here
```

```bash
# Your integration tests here
```

### Exercise 6: Frontend Integration
1. Create a React component that displays restaurants on a map
2. Add search functionality with spatial filtering
3. Implement real-time location updates
4. Create a mobile-responsive restaurant finder

```javascript
// Your frontend code here
```

## Key Spatial Concepts Demonstrated

### **Coordinate Systems**
- **WGS84 (SRID 4326)**: Geographic coordinates (latitude/longitude) for data storage
- **Web Mercator (SRID 3857)**: Projected coordinates for accurate distance calculations
- **Coordinate Transformation**: Converting between systems for different operations

### **Distance Calculations**
- **Geography vs Geometry**: Using geography type for accurate spheroidal calculations
- **Projected Calculations**: Converting to meters for precise distance measurements
- **Performance Trade-offs**: Balancing accuracy with query speed

### **Spatial Relationships**
- **ST_Within**: Point-in-polygon testing for containment
- **ST_Intersects**: Checking if geometries overlap or touch
- **ST_DWithin**: Efficient proximity queries within specified distances
- **ST_Distance**: Calculating exact distances between features

### **Indexing Strategy**
- **GiST Indexes**: R-tree spatial indexes for fast geometric queries
- **Partial Indexes**: Optimized indexes for specific query patterns
- **Index Maintenance**: Keeping spatial indexes current and efficient

### **Data Formats**
- **GeoJSON**: Web-standard format for geographic data exchange
- **WKT (Well-Known Text)**: Human-readable geometry representation
- **PostGIS Internal**: Optimized binary format for database storage

## Integration Patterns

The workshop demonstrates how these spatial operations integrate into complete applications:

1. **Location Services**: Find nearby points of interest with distance ranking
2. **Geofencing**: Determine if users are within service boundaries
3. **Route Analysis**: Calculate paths and analyze transportation networks
4. **Spatial Analytics**: Generate business intelligence from geographic data
5. **Data Pipeline**: Import, process, and export spatial data at scale

This completes the comprehensive PostgREST and PostGIS workshop content. The combination of PostgREST's automatic API generation with PostGIS's spatial capabilities creates a powerful platform for building location-aware applications.