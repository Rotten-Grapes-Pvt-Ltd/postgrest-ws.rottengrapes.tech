FROM postgis/postgis:17-3.4

# Install build dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    postgresql-server-dev-17

# Clone and build pgjwt
RUN git clone https://github.com/michelp/pgjwt.git /tmp/pgjwt && \
    cd /tmp/pgjwt && \
    make && \
    make install && \
    rm -rf /tmp/pgjwt
