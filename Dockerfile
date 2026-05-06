FROM node:24-slim

RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "index.js"]
