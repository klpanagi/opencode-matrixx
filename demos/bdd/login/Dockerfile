# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# BDD test runner for the 1001_username_password feature.
#
# Build context is the repository root. Run from the repo root:
#   docker build -f demos/bdd/login/Dockerfile -t matrixx-bdd-login .
#   docker run --rm matrixx-bdd-login
#   docker run --rm -e BDD_ARGS="--tags @happy-path" matrixx-bdd-login
# ---------------------------------------------------------------------------

ARG BUN_VERSION=1.3.6
FROM oven/bun:${BUN_VERSION} AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

RUN bunx playwright install chromium

COPY demos/bdd ./demos/bdd
COPY src/features/bdd ./src/features/bdd

RUN chmod +x ./demos/bdd/login/run-tests.sh

ENV BDD_BASE_URL=http://127.0.0.1:3000
ENV PREVIEW_PORT=3000
ENV CI=true

WORKDIR /app/demos/bdd/login
CMD ["bash", "run-tests.sh"]
