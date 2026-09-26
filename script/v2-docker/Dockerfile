# Container image for the OpenCode V2 plugin smoke test.
#
# Ships the real V2 CLI (`@opencode/cli`), a neutral V2 "probe plugin" that
# records what the V2 host actually hands a plugin, and a HTTP prober used to
# answer whether V2 still serves the V1 SDK endpoints Matrixx depends on.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/v2-cli
RUN npm init -y >/dev/null 2>&1 \
  && npm install --no-audit --no-fund @opencode/cli@2.0.18 @opencode/plugin@2.0.16 @opencode/client@2.0.16

# Record the raw version actually installed, so the report can quote evidence
# rather than the Dockerfile's intent.
RUN node -e "console.log(require('@opencode/cli/package.json').version)" > /opt/v2-cli/VERSION

# The probe plugin is a plugin DIRECTORY (V2 rejects a bare `.js` path) and is
# copied next to the CLI's node_modules so its bare `@opencode/plugin` import
# resolves, exactly as a real third-party plugin would.
COPY probe-plugin /opt/v2-cli/probe-plugin
COPY probe.mjs /opt/v2-smoke/probe.mjs
COPY v1-client-probe.mjs /opt/v2-smoke/v1-client-probe.mjs
COPY v2-client-probe.mjs /opt/v2-smoke/v2-client-probe.mjs
COPY agent-listing-probe.mjs /opt/v2-smoke/agent-listing-probe.mjs
COPY v2-route-probe.mjs /opt/v2-smoke/v2-route-probe.mjs
COPY probe-plugin /opt/v2-smoke/probe-plugin
COPY in-container.sh /opt/v2-smoke/in-container.sh
RUN chmod +x /opt/v2-smoke/in-container.sh

ENV MATRIXX_LOG=/tmp/matrixx.log
ENTRYPOINT ["/bin/sh", "/opt/v2-smoke/in-container.sh"]
