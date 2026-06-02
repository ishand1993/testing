FROM node:20-slim
WORKDIR /usr/src/app
COPY package*.json ./

# 👇 Changed this line to use a standard install instead of a clean install
RUN npm install --production

COPY . ./
CMD [ "npm", "start" ]