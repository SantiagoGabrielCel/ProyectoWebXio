FROM nginx:1.27-alpine

COPY placeholder-checkout-colores-liderlib-v7.html /usr/share/nginx/html/index.html
COPY modern-ui.css /usr/share/nginx/html/modern-ui.css

EXPOSE 80
