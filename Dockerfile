# 前端容器（決策 Q10）：先用 Node 打包成靜態檔，再交給 nginx 提供；/api 轉給後端。
# 小組的 docker-compose.yml 用法：
#   frontend:
#     build: ./frontend
#     ports: ["8080:80"]
#     depends_on: [backend]
# 後端服務名稱預設 backend:8000，可用 BACKEND_URL 改。

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 預設接真的後端；要做展示版可以 --build-arg VITE_USE_MOCK=true
ARG VITE_USE_MOCK=false
ENV VITE_USE_MOCK=$VITE_USE_MOCK
RUN npx vite build

FROM nginx:1.27-alpine
ENV BACKEND_URL=http://backend:8000
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
