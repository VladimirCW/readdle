# Playwright base image: bundles Node.js, the browsers and every system
# dependency, pinned to the same version as @playwright/test in package.json.
# Keep this tag in sync with that version.
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Install dependencies first so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the project (see .dockerignore for what is excluded).
COPY . .

# Defaults for a containerised run — override any of them with `docker run -e`.
# environments/.env is intentionally NOT copied into the image; configure via env.
# Target URLs come from the defaults in src/config/testConfig.ts (deployed
# instance) — override with -e TEST_HOST=... (or API_BASE_URL / BASE_URL).
ENV LOG_LEVEL=info \
    TEST_TIMEOUT_IN_MINUTES=10 \
    CI=true

# Run `npm run test` by default. Anything after the image name replaces the
# script name, e.g.  docker run --rm readdle-tests test:ui
ENTRYPOINT ["npm", "run"]
CMD ["test"]
