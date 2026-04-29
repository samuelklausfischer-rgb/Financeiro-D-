# Multi-stage Dockerfile for React + Vite + Bun app
# Stage 1: Build
FROM oven/bun:latest AS builder
WORKDIR /app

# Build arguments for environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_PRN_ANALYSIS_API_URL
ARG VITE_DUPLICITY_ANALYSIS_API_URL
ARG VITE_PRN_OMIE_LOOKUP_API_URL

# Set environment variables for Vite to pick up during build
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV VITE_PRN_ANALYSIS_API_URL=${VITE_PRN_ANALYSIS_API_URL}
ENV VITE_DUPLICITY_ANALYSIS_API_URL=${VITE_DUPLICITY_ANALYSIS_API_URL}
ENV VITE_PRN_OMIE_LOOKUP_API_URL=${VITE_PRN_OMIE_LOOKUP_API_URL}

COPY package.json bun.lockb ./
RUN bun install
COPY . .
RUN bun run build

# Stage 2: Serve
FROM oven/bun:latest
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
EXPOSE 5173
CMD ["bun", "run", "server.ts"]
