FROM node:20-alpine

# The frontend is an npm workspace of the repository root, and the only
# lockfile lives at the root. Build from the root context so `npm ci` installs
# the exact locked dependency tree instead of re-resolving it from scratch
# (re-resolving frontend/package.json alone crashes npm on the workspace-only
# `overrides` block: "Cannot read properties of null (reading 'edgesOut')").
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
# --ignore-scripts: skip the root `prepare: husky` git-hook installer (husky is a
# root devDependency not installed here, and there is no .git in the image).
RUN npm ci --workspace=frontend --include-workspace-root=false --ignore-scripts

COPY frontend ./frontend

WORKDIR /app/frontend

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
