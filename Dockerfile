FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++ curl
RUN npm install -g bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY scripts/download-ephe.sh scripts/
RUN sh scripts/download-ephe.sh /app/ephe
COPY . .
RUN bun run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/ephe ./ephe
COPY --from=build /app/package.json ./
ENV SWE_EPHE_PATH=/app/ephe
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/server.js"]
