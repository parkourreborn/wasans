FROM node:20-slim

WORKDIR /usr/src/app

# Install netcat for health checks
RUN apt-get update \
    && apt-get install -y --no-install-recommends netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

COPY package.json .
RUN npm install --production

COPY . .

EXPOSE 4500
CMD ["npm", "start"]
