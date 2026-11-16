# This is a test environment, not a distributable plugin executable.
# Keep its Playwright version aligned with package-lock.json.
FROM mcr.microsoft.com/playwright:v1.56.1-noble@sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a
ARG TARGETARCH
RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) node_arch=arm64; node_sha=9b2a2eeb98a8eb37361224e2a1d060300ad2dd143af58dfdb16de785df0f1228; nvim_arch=arm64; nvim_sha=f697d4e4582b6e4b5c3c26e76e06ce26efa08ba1768e03fd2733fcc422bb0490 ;; \
      amd64) node_arch=x64; node_sha=6159227e0af7d7c3c6bb2fa900452b04a6cb8841a702a79acc613209d70b04d0; nvim_arch=x86_64; nvim_sha=31cf85945cb600d96cdf69f88bc68bec814acbff50863c5546adef3a1bcef260 ;; \
      *) echo "Unsupported test architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl --fail --location --retry 3 "https://nodejs.org/dist/v24.12.0/node-v24.12.0-linux-$node_arch.tar.gz" -o /tmp/node.tar.gz; \
    echo "$node_sha  /tmp/node.tar.gz" | sha256sum --check; \
    tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1; \
    curl --fail --location --retry 3 "https://github.com/neovim/neovim/releases/download/v0.12.2/nvim-linux-$nvim_arch.tar.gz" -o /tmp/nvim.tar.gz; \
    echo "$nvim_sha  /tmp/nvim.tar.gz" | sha256sum --check; \
    mkdir -p /opt/nvim; \
    tar -xzf /tmp/nvim.tar.gz -C /opt/nvim --strip-components=1; \
    rm /tmp/node.tar.gz /tmp/nvim.tar.gz; \
    npm install --global npm@11.10.0
ENV PATH="/opt/nvim/bin:${PATH}"
WORKDIR /checks/plugin with spaces
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
CMD ["npm", "test", "--", "--report-dir", "/checks/results/chromium"]
