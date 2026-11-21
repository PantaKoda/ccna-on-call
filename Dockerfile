# CCNA: On Call - static site served by nginx.
#
#   docker build -t ccna-on-call .
#   docker run --rm -p 8080:80 ccna-on-call

# Stage 1: play every lab's scripted solution against the simulator, so a
# level that can no longer be completed fails the build instead of shipping.
FROM node:22-alpine AS test
WORKDIR /app
COPY package.json ./
COPY js ./js
COPY content ./content
COPY tests ./tests
RUN node tests/run-levels.mjs

# Stage 2: the image that runs.
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY data /usr/share/nginx/html/data
COPY content /usr/share/nginx/html/content
# copying from the test stage makes the build depend on the tests passing
COPY --from=test /app/js /usr/share/nginx/html/js
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
