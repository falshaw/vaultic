# Vaultic bridge — LLM gateway + RAG (/rag/*) running OLLAMA-ONLY.
# Derived from a general-purpose LLM bridge but stripped of the
# Anthropic `claude` CLI and credential mount: Vaultic v0 is fully local, so
# there is no external-API code path in the image at all. /generate(claude) is
# unused; the assistant generates against the bundled Ollama, and the bridge
# serves /rag/* (Ollama embeddings → Qdrant) + /health + /metrics.
FROM node:24.19-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

RUN rm -rf /var/lib/apt/lists/* && apt-get -o Acquire::Retries=5 -o Acquire::http::Pipeline-Depth=0 update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Non-root user with a writable HOME + /app for the bridge's local RAG state.
RUN useradd --create-home --uid 1001 bridge \
 && mkdir -p /app \
 && chown -R bridge:bridge /app
ENV HOME=/home/bridge
ENV NODE_ENV=production

COPY --chown=bridge:bridge claude-bridge.mjs chunk.mjs /app/

USER bridge
WORKDIR /app
EXPOSE 7777

CMD ["node", "/app/claude-bridge.mjs"]
