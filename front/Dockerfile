FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV WATCHPACK_POLLING=true
CMD ["node_modules/.bin/next", "dev", "-p", "3000", "--hostname", "0.0.0.0"]
