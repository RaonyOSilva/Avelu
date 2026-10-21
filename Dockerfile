FROM node:22.23.3-bookworm-slim
# Oracle client, not Debian's default MariaDB client. Fail closed on unsupported arch/signature.
ARG MYSQL_CLIENT_VERSION=8.0.46-1debian12
RUN set -eux; \
    test "$(dpkg --print-architecture)" = amd64; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl --fail --silent --show-error --location --proto '=https' \
      https://repo.mysql.com/RPM-GPG-KEY-mysql-2025 -o /tmp/mysql.asc; \
    gpg --batch --show-keys --with-colons /tmp/mysql.asc | grep -q 'fpr:::::::::BCA43417C3B485DD128EC6D4B7B3B788A8D3785C:'; \
    gpg --batch --dearmor --output /usr/share/keyrings/mysql.gpg /tmp/mysql.asc; \
    echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/mysql.gpg] https://repo.mysql.com/apt/debian/ bookworm mysql-8.0' > /etc/apt/sources.list.d/mysql.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends mysql-community-client="${MYSQL_CLIENT_VERSION}"; \
    mysql --version | grep '8.0.'; \
    mysqldump --version | grep '8.0.'; \
    apt-get purge -y --auto-remove curl gnupg; \
    rm -rf /var/lib/apt/lists/* /tmp/mysql.asc /root/.gnupg
ENV NODE_ENV=production HOST=0.0.0.0 \
    MYSQL_PATH=/usr/bin/mysql MYSQLDUMP_PATH=/usr/bin/mysqldump
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node . .
RUN install -d -o node -g node -m 0700 /data/backups /app/.backups
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
