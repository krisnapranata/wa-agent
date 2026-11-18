# Image produksi wabot (NestJS + Baileys). Multi-stage: build terpisah dari runtime; runtime non-root.
# Satu image, dua peran: `web` (API + dashboard + koneksi WhatsApp) dan `scheduler` (broadcast terjadwal).

# ---------- deps: semua dependensi (termasuk dev) untuk build ----------
FROM node:22-alpine AS deps
WORKDIR /app
# .yarnrc.yml menunjuk globalFolder ke /opt/hostedapp (host lama) dan memakai hardlink global:
# di dalam image, override ke folder lokal + node_modules biasa agar bisa disalin antar stage.
ENV YARN_GLOBAL_FOLDER=/tmp/yarn-global YARN_NM_MODE=classic COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

# ---------- build ----------
FROM deps AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN yarn build

# ---------- prod-deps: hanya dependensi produksi ----------
FROM deps AS prod-deps
RUN yarn workspaces focus --all --production

# ---------- runtime ----------
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 TZ=Asia/Makassar SESSION_DIR=/app/wa_sessions
RUN apk add --no-cache tzdata
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node --chmod=755 docker/entrypoint.sh /app/docker/entrypoint.sh
# Folder session WhatsApp (dipakai bila AUTH_STORE=file); dibuat & di-chown sebelum USER agar volume bisa ditulis.
RUN mkdir -p /app/wa_sessions && chown node:node /app/wa_sessions
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["web"]
