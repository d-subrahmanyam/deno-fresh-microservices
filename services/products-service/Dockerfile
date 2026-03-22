# Multi-stage build for Deno services

FROM denoland/deno:1.40.0 AS base

WORKDIR /app
RUN mkdir -p /deno-dir
ENV DENO_DIR=/deno-dir

# Copy shared dependencies
COPY shared/ ./shared/
COPY services/products-service/ ./services/products-service/

# Cache dependencies
RUN deno cache services/products-service/main.ts

# Production stage
FROM denoland/deno:1.40.0

WORKDIR /app

# Copy cached dependencies
COPY --from=base /deno-dir /deno-dir
COPY --from=base /app ./

# Prevent stale compiled sources when compose bind mounts local files over /app
RUN rm -rf /deno-dir/gen/file/app/

ENV DENO_DIR=/deno-dir

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD deno eval --allow-net 'const response = await fetch("http://127.0.0.1:3003/health"); if (!response.ok) Deno.exit(1);'

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "services/products-service/main.ts"]
