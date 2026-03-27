FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY editorial ./editorial
COPY prisma.config.ts tsconfig.json ./
RUN npx prisma generate

COPY src ./src
RUN npm run build

ENV NODE_ENV=production

EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy || npx prisma db push; node dist/index.js"]
