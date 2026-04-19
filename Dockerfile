# ─── Stage 1: Dependencies ───────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-engines

# ─── Stage 2: Build ──────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

# ─── Stage 3: Production ─────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

RUN apk add --no-cache curl libc6-compat

# PM2
RUN npm install -g pm2

# Production dependencies only
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-engines --production && \
    yarn cache clean

# Build output + configs
COPY --from=build /app/dist ./dist
COPY ecosystem.config.js ./

# Admin panel assets: EJS views + static files
COPY views ./views
COPY public ./public

EXPOSE 3000

ENV ECOSYSTEM_CONFIG=ecosystem.config.js
CMD pm2-runtime ${ECOSYSTEM_CONFIG}
