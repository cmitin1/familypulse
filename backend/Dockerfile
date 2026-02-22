FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy || npx prisma db push && npm run prisma:seed || true && npm run dev"]
