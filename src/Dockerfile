FROM node:latest

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

ENV PORT=6969
ENV INSTANCES=1
ENV BACKLOG=4096
ENV DATABASE_URL=postgresql://admin:123@localhost:5432/rinha

EXPOSE 6969

CMD ["node", "index.js"]
