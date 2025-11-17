# PostgREST Workshop

A comprehensive workshop on PostgREST and PostGIS with hands-on examples and complete Docker environment.

## Quick Start

1. **Start the workshop environment**:
   ```bash
   docker-compose up -d
   ```

2. **Access the services**:
   - 📚 **Workshop Documentation**: http://localhost:8000
   - 🔌 **PostgREST API**: http://localhost:3000
   - 📊 **Swagger UI**: http://localhost:8081
   - 🗄️ **pgAdmin**: http://localhost:8080 (admin@workshop.com / admin123)

3. **Test the API**:
   ```bash
   curl http://localhost:3000/hello_world
   ```

## What's Included

- **Complete Docker Environment** - PostgreSQL, PostgREST, pgAdmin, Swagger UI, MkDocs
- **Sample Data** - Pre-populated workshops, locations, and spatial data
- **Authentication Setup** - JWT-based auth with user roles
- **Spatial Data** - PostGIS integration with real Boston area locations
- **Custom Functions** - Ready-to-use PostgreSQL functions as API endpoints

## Workshop Modules

1. [Introduction to PostgreSQL](http://localhost:8000/postgresql-intro/)
2. [Introduction to PostGIS](http://localhost:8000/postgis-intro/)
3. [Setting up PostgREST](http://localhost:8000/postgrest-setup/)
4. [Advanced Authentication](http://localhost:8000/postgrest-auth/)
5. [Using Functions](http://localhost:8000/postgrest-functions/)
6. [GIS with PostgREST](http://localhost:8000/postgrest-gis/)

## Requirements

- Docker and Docker Compose
- 8GB+ RAM recommended
- Ports 3000, 5432, 8000, 8080, 8081 available

## Stopping the Workshop

```bash
# Stop all services
docker-compose down

# Stop and remove all data
docker-compose down -v
```
