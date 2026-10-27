# KProof demo: a static page built with Vite, served by unprivileged nginx.
#
#   docker build --build-arg NODE_VERSION=$(cat .nvmrc) \
#     --build-arg VITE_KPROOF_API_URL=https://stg-api.koreanproof.com \
#     --build-arg VITE_KPROOF_ENV=staging -t kproof-demo .
#
# Both build args are required; the build fails without them (vite.config.ts).
ARG NODE_VERSION
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_KPROOF_API_URL
ARG VITE_KPROOF_ENV
ENV VITE_KPROOF_API_URL=${VITE_KPROOF_API_URL} VITE_KPROOF_ENV=${VITE_KPROOF_ENV}
RUN npm run build

FROM build AS test
CMD ["npm", "test"]

FROM nginxinc/nginx-unprivileged:1.31.7-alpine AS runtime
ARG VITE_KPROOF_API_URL
ARG GIT_COMMIT=unknown
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /tmp/nginx.conf.template
USER root
RUN api="${VITE_KPROOF_API_URL%/}" \
 && ws="$(echo "$api" | sed 's#^http#ws#')" \
 && sed -e "s#__API_URL__#${api}#g" -e "s#__API_WS_URL__#${ws}#g" /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf \
 && rm /tmp/nginx.conf.template \
 && echo "${GIT_COMMIT}" > /usr/share/nginx/html/version.txt \
 && grep -q "connect-src 'self' ${api} ${ws};" /etc/nginx/conf.d/default.conf
USER 101
EXPOSE 8080
