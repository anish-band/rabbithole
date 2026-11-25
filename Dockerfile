# Rabbithole as an AWS Lambda container image (arm64), served through the
# Lambda Web Adapter: the same Next.js server, behind a Lambda function URL.
# It also runs as a plain container (the adapter is inert outside Lambda):
#   docker build -t rabbithole . && docker run -p 8080:8080 rabbithole
#
# Needs data/models/ (the local embedding model) in the build context; it
# ships read-only inside the image. Everything writable goes to /tmp.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
RUN npm run build
RUN test -d data/models || (echo "data/models is missing: run the app or 'npm run eval:rank' once to download the model" && exit 1)

FROM node:22-bookworm-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    AWS_LWA_PORT=8080 \
    AWS_LWA_READINESS_CHECK_PROTOCOL=tcp \
    RABBITHOLE_DATA_DIR=/tmp/data \
    RABBITHOLE_MODELS_DIR=/app/data/models \
    RABBITHOLE_CLAUDE=off
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/data/models ./data/models
# The embedding runtime is loaded dynamically, so Next's file tracing misses it.
COPY --from=build /app/node_modules/onnxruntime-node ./node_modules/onnxruntime-node
COPY --from=build /app/node_modules/onnxruntime-common ./node_modules/onnxruntime-common
# Lambda's filesystem is read-only outside /tmp; Next writes its cache under .next/cache.
RUN rm -rf .next/cache && ln -s /tmp/next-cache .next/cache
ARG VERSION=dev
ENV RABBITHOLE_VERSION=$VERSION
CMD ["sh", "-c", "mkdir -p /tmp/next-cache /tmp/data && exec node server.js"]
