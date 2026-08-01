FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"production\" ]; then npm run build && node .next/standalone/server.js; else npm run dev; fi"]
