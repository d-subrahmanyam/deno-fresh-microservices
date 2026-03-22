# Build stage
FROM node:20-alpine AS css-builder

WORKDIR /app

# Copy only what's needed for CSS generation
COPY package.json* ./
COPY tailwind.config.ts ./
COPY static/styles.css ./static/

# Install tailwindcss
RUN npm install --only=prod --legacy-peer-deps tailwindcss@3.3.6 postcss

# Copy the source files for tailwindcss content scanning
COPY routes ./routes
COPY islands ./islands
COPY components ./components

# Generate CSS
RUN npx tailwindcss -i ./static/styles.css -o ./static/styles.css

# Deno build stage
FROM denoland/deno:1.40.0 AS deno-builder

WORKDIR /app

# Copy all project files
COPY . .

# Cache dependencies
RUN deno cache dev.ts

# Production stage
FROM denoland/deno:1.40.0

WORKDIR /app

# Copy from paths
COPY --from=deno-builder /deno-dir /deno-dir
COPY . .

# Copy the generated CSS AFTER other files so it overwrites the source
COPY --from=css-builder /app/static/styles.css ./static/styles.css

# Clear pre-compiled route caches so local source files are always recompiled
RUN rm -rf /deno-dir/gen/file/app/

ENV DENO_DIR=/deno-dir

EXPOSE 8000

CMD ["deno", "run", "--allow-all", "main.ts"]
