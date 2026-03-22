# Build stage
FROM denoland/deno:1.40.0 AS builder

WORKDIR /app

# Copy project files
COPY . .

# Cache dependencies
RUN deno cache dev.ts

# Production stage
FROM denoland/deno:1.40.0

WORKDIR /app

# Copy from builder
COPY --from=builder /deno-dir /deno-dir
COPY . .

# Clear pre-compiled route caches so local source files are always recompiled
# This prevents stale .js caches when source files change via bind mount
RUN rm -rf /deno-dir/gen/file/app/

ENV DENO_DIR=/deno-dir

EXPOSE 8000

CMD ["deno", "run", "--allow-all", "main.ts"]
