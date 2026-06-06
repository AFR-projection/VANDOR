FROM ghcr.io/imputnet/cobalt:latest AS cobalt-app

FROM node:24-alpine

RUN apk add --no-cache python3 py3-pip ffmpeg curl

WORKDIR /app
COPY --from=cobalt-app /app /cobalt

COPY requirements.txt /ytdlp/requirements.txt
RUN pip3 install --break-system-packages -r /ytdlp/requirements.txt

COPY ytdlp-server.py /ytdlp/ytdlp-server.py
COPY proxy.mjs start.sh /app/
RUN chmod +x /app/start.sh

ENV COBALT_PORT=9000
ENV YTDLP_PORT=8081
ENV PORT=8080

EXPOSE 8080
CMD ["/app/start.sh"]
