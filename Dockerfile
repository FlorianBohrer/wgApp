FROM node:22-alpine

WORKDIR /app

COPY server/package*.json server/
RUN npm --prefix server install --omit=dev

COPY client/package*.json client/
RUN npm --prefix client install

COPY . .
RUN npm --prefix client run build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/src/index.js"]
