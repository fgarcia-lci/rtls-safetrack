# Multi-stage Dockerfile para positioning-frontend.
#   - build: node 20 + vite build → dist/
#   - runtime: nginx alpine sirviendo dist/ + proxy /api → positioning-api:8090

# ---- STAGE: build ----
FROM node:20-alpine AS build
WORKDIR /build

COPY package.json package-lock.json* ./
# `npm install` (no ci) para tolerar package-lock.json desactualizado tras
# añadir deps en el host sin haber actualizado el lock file.
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---- STAGE: runtime ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
