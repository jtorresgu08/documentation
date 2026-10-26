# Imagen de la plataforma: servidor Traccar con el parche de jerarquía + panel web personalizado.
# Contexto de build: la carpeta tracking-platform/ (ver infra/docker-compose.yml).

ARG TRACCAR_VERSION=v6.9.1

FROM eclipse-temurin:21-jdk AS server
ARG TRACCAR_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN git clone --depth 1 --branch ${TRACCAR_VERSION} https://github.com/traccar/traccar.git .
COPY server/patches/ /patches/
RUN git apply --verbose /patches/*.patch \
    && ./gradlew --no-daemon assemble -x test

FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM eclipse-temurin:21-jre
RUN groupadd --system traccar && useradd --system --gid traccar --home-dir /opt/traccar traccar
WORKDIR /opt/traccar
COPY --from=server /build/target/tracker-server.jar ./
COPY --from=server /build/target/lib ./lib
COPY --from=server /build/schema ./schema
COPY --from=server /build/templates ./templates
COPY --from=web /web/build ./web
COPY server/traccar.xml ./conf/traccar.xml
RUN mkdir -p data logs media && chown -R traccar:traccar data logs media
USER traccar
ENV CONFIG_USE_ENVIRONMENT_VARIABLES=true \
    JAVA_OPTS="-Xms512m -Xmx2g"
EXPOSE 8082
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/8082 && printf 'GET /api/health HTTP/1.0\\r\\n\\r\\n' >&3 && grep -q '200' <&3"]
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar tracker-server.jar conf/traccar.xml"]
