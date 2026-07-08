# Stage 1 : build TypeScript + génération du client Prisma
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2 : image de prod (deps de prod uniquement, dist/ compilé)
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
# npm ci réinstalle @prisma/client sans le client généré : on le régénère ici.
# Le CLI prisma est en dependencies (migrate deploy au démarrage du conteneur).
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
