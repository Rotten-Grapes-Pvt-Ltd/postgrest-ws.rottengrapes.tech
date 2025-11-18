# PostgREST Workshop

Welcome to the comprehensive PostgREST and PostGIS workshop! This hands-on workshop will teach you how to build powerful REST APIs directly from your PostgreSQL database using PostgREST, with advanced spatial capabilities through PostGIS.

## What You'll Learn

- **PostgreSQL Fundamentals** - Core database concepts and SQL operations
- **PostGIS Spatial Extensions** - Geographic data types and spatial operations
- **PostgREST API Generation** - Automatic REST API creation from database schema
- **JWT Authentication** - Secure API access with JSON Web Tokens
- **Custom Functions** - Implementing business logic with PostgreSQL functions
- **Spatial APIs** - Building location-aware applications with PostGIS and PostgREST

## Prerequisites

- Basic understanding of databases and SQL
- Familiarity with REST APIs
- Docker installed on your system
- Basic command line knowledge


!!! note "If you don't have Prerequisites full filled"

      Consider taking our course on [Ultimate PostGIS training](https://krishnaglodha.com/courses/ultimate-postgis-course/) where we have covered everything from databases to deployments in 30 hours


## Workshop Environment Setup

This workshop includes a complete Docker Compose setup with all required services. The `docker-compose.yml` file in this repository includes:

- **PostgreSQL with PostGIS** - Spatial database
- **PostgREST** - Automatic REST API generation
- **pgAdmin** - Database management interface
- **Swagger UI** - API documentation
- **MkDocs** - This documentation site

### Database Initialization

The workshop includes pre-configured initialization scripts in the `init-scripts/` directory:

- `01-init.sql` - Creates database roles, tables, and sample data
- `02-functions.sql` - Creates PostgreSQL functions for the workshop

These scripts automatically set up:
- PostgreSQL extensions (PostGIS, pgcrypto, pgjwt)
- PostgREST authentication roles and permissions
- Basic authentication functions (login, register)
- Sample hello_world table for testing

**Note**: Most tables (workshops, participants, locations, regions, routes) are created as part of the documentation examples and should be run manually during the workshop.

### Starting the Workshop Environment

1. **Clone this repository**:
   ```bash
   git clone https://github.com/Rotten-Grapes-Pvt-Ltd/postgrest-ws.rottengrapes.tech
   cd postgrest-ws.rottengrapes.tech
   ```

2. **Start all services**:
   ```bash
   docker-compose up --build
   ```

3. **Verify services are running**:
   ```bash
   # Check all services
   docker-compose ps
   
   # Test the API
   curl http://localhost:3000/hello_world
   
   # View logs if needed
   docker-compose logs [service-name]
   ```

### Service Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| **Workshop Documentation** | http://localhost:8000 | N/A |
| **PostgREST API** | http://localhost:3000 | N/A |
| **pgAdmin** | http://localhost:8080 | admin@workshop.com / admin123 |
| **Swagger UI** | http://localhost:8081 | N/A |
| **PostgreSQL** | localhost:5432 | postgres / workshop123 |

### pgAdmin Database Connection

When setting up pgAdmin:

1. Open http://localhost:8080
2. Login with admin@workshop.com / admin123
3. Add new server with these settings:
   - **Name**: Workshop Database
   - **Host**: postgres
   - **Port**: 5432
   - **Database**: workshop
   - **Username**: postgres
   - **Password**: workshop123

## Workshop Structure

### Module 1: [Introduction to PostgreSQL](postgresql-intro.md)
Learn PostgreSQL fundamentals including data types, basic operations, and advanced features like JSON support and arrays.

### Module 2: [Introduction to PostGIS](postgis-intro.md)
Explore spatial data capabilities with PostGIS, including geometry types, spatial functions, and coordinate systems.

### Module 3: [Setting up PostgREST](postgrest-setup.md)
Get PostgREST running and learn how to create REST APIs automatically from your database schema.

### Module 4: [Advanced Authentication](postgrest-auth.md)
Implement secure authentication using JWT tokens and PostgreSQL's Row Level Security.

### Module 5: [Using Functions](postgrest-functions.md)
Create custom PostgreSQL functions that become RPC endpoints in your PostgREST API.

### Module 6: [GIS with PostgREST](postgrest-gis.md)
Combine PostgREST with PostGIS to build powerful spatial APIs for location-aware applications.

## Quick Start Example

Once your environment is running, the database is pre-populated with sample data. Try these examples:

1. **Test the basic API**:
   ```bash
   # Test hello world endpoint
   curl http://localhost:3000/hello_world
   
   # Test hello world function
   curl -X POST http://localhost:3000/rpc/hello_world \
     -H "Content-Type: application/json" \
     -d '{"name": "Workshop"}'
   ```

2. **After creating tables in the workshop**:
   ```bash
   # Get workshops (after creating workshops table)
   curl http://localhost:3000/workshops
   
   # Get locations (after creating locations table)
   curl http://localhost:3000/locations
   ```

3. **View API documentation**:
   - Open http://localhost:8081 for Swagger UI
   - Open http://localhost:8000 for this workshop documentation

## Troubleshooting

### Common Issues

**PostgREST not starting**:
- Check database connection in docker-compose logs
- Verify database roles are created correctly

**Permission denied errors**:
- Ensure proper GRANT statements are executed
- Check that the correct role is being used

**Spatial queries not working**:
- Verify PostGIS extension is installed
- Check that spatial indexes are created

### Useful Commands

```bash
# View logs for all services
docker-compose logs

# View logs for specific service
docker-compose logs postgres
docker-compose logs postgrest
docker-compose logs mkdocs

# Restart services
docker-compose restart

# Stop all services
docker-compose down

# Reset everything (removes data)
docker-compose down -v

# Rebuild and restart
docker-compose up -d --build
```

## Resources

- [PostgREST Documentation](https://postgrest.org/en/stable/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Workshop Support

If you encounter issues during the workshop:

1. Check the troubleshooting section above
2. Review the service logs using docker-compose logs
3. Ensure all prerequisites are met
4. Verify your Docker setup is working correctly

Let's begin with [Introduction to PostgreSQL](postgresql-intro.md)!