FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production 2>/dev/null || true
COPY . .
EXPOSE 3000
ENV PORT=3000
CMD ["node", "intel-server.js"]
