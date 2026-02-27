FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY packages/api/package.json packages/api/package.json
RUN npm ci --workspace=api

COPY packages/api packages/api
WORKDIR /app/packages/api

RUN npx prisma generate
RUN npm run build

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
