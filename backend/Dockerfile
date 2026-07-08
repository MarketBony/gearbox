# Stage 1 : build TypeScript + génération du client Prisma
FROM node:20-slim AS build
WORKDIR /app
# openssl absent de node:20-slim : sans lui, Prisma ne détecte pas libssl et
# se rabat sur les engines openssl-1.1.x, incompatibles bookworm (schema engine crash).
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
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
# Même besoin qu'au build : libssl requis par les engines Prisma à l'exécution
# (schema engine du migrate deploy au démarrage + query engine du runtime).
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
# npm ci réinstalle @prisma/client sans le client généré : on le régénère ici.
# Le CLI prisma est en dependencies (migrate deploy au démarrage du conteneur).
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
