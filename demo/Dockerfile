# KProof demo: a static page built with Vite, served by unprivileged nginx.
# Build from the REPOSITORY ROOT: the page uses the SDK in sdk/ from the same
# commit (npm workspace).
#
#   docker build -f demo/Dockerfile --build-arg NODE_VERSION=$(cat .nvmrc) \
#     --build-arg VITE_KPROOF_API_URL=https://stg-api.koreanproof.com \
#     --build-arg VITE_KPROOF_ENV=staging -t kproof-demo .
#
# Both VITE_ build args are required; the build fails without them (demo/vite.config.ts).
ARG NODE_VERSION
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY sdk/package.json sdk/package.json
COPY demo/package.json demo/package.json
RUN npm ci --workspace demo --include-workspace-root=false
COPY sdk sdk
COPY demo demo
ARG VITE_KPROOF_API_URL
ARG VITE_KPROOF_ENV
ENV VITE_KPROOF_API_URL=${VITE_KPROOF_API_URL} VITE_KPROOF_ENV=${VITE_KPROOF_ENV}
WORKDIR /repo/demo
RUN npm run build

FROM build AS test
CMD ["npm", "test"]

FROM nginxinc/nginx-unprivileged:1.31.7-alpine AS runtime
ARG GIT_COMMIT=unknown
COPY --from=build /repo/demo/dist /usr/share/nginx/html
COPY demo/nginx.conf.template /tmp/nginx.conf.template
USER root
RUN sources="$(cat /usr/share/nginx/html/connect-src.txt)" \
 && test -n "$sources" \
 && sed -e "s#__CONNECT_SRC__#${sources}#g" /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf \
 && rm /tmp/nginx.conf.template \
 && echo "${GIT_COMMIT}" > /usr/share/nginx/html/version.txt \
 && grep -q "connect-src 'self' ${sources};" /etc/nginx/conf.d/default.conf
USER 101
EXPOSE 8080
