FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY seed-images ./seed-images
COPY test ./test
COPY openapi.yaml ./
RUN mkdir -p /app/uploads
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
