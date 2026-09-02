FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.html admin.html modern-ui.css ./
COPY server ./server
COPY "Imagenes de Productos" "./Imagenes de Productos"

RUN mkdir -p datos uploads/products

EXPOSE 3000
CMD ["node", "--experimental-sqlite", "server/server.js"]
