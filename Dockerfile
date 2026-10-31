# syntax=docker/dockerfile:1
FROM node:24.19.0-slim
WORKDIR /app
COPY --chmod=644 package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --ignore-scripts --strict-ssl=true && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node ui ./ui
COPY --chown=node:node references/policy.schema.json ./references/policy.schema.json
RUN mkdir -p /data && chown node:node /data
ARG REVISION=unknown
LABEL org.opencontainers.image.title="chatgpt-ceo" org.opencontainers.image.version="0.1.0" org.opencontainers.image.revision=$REVISION
USER node
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/ceo.sqlite
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/main.ts"]
