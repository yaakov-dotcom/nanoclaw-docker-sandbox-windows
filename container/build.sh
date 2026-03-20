#!/bin/bash
# Build the NanoClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent"
TAG="${1:-latest}"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"

echo "Building NanoClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"

# Forward proxy env vars for sandbox builds
BUILD_ARGS=""
[ -n "${http_proxy:-}" ] && BUILD_ARGS="$BUILD_ARGS --build-arg http_proxy=$http_proxy"
[ -n "${https_proxy:-}" ] && BUILD_ARGS="$BUILD_ARGS --build-arg https_proxy=$https_proxy"

# Load GITHUB_PAT from .env if not already set in environment
if [ -z "${GITHUB_PAT:-}" ] && [ -f "../.env" ]; then
  GITHUB_PAT=$(grep '^GITHUB_PAT=' "../.env" | cut -d= -f2-)
fi

# Pass PAT as BuildKit secret via temp file (never stored in image layers)
SECRET_ARGS=""
if [ -n "${GITHUB_PAT:-}" ]; then
  PAT_FILE=$(mktemp)
  printf '%s' "$GITHUB_PAT" > "$PAT_FILE"
  SECRET_ARGS="--secret id=github_pat,src=$PAT_FILE"
  trap "rm -f $PAT_FILE" EXIT
fi

DOCKER_BUILDKIT=1 ${CONTAINER_RUNTIME} build ${BUILD_ARGS} ${SECRET_ARGS} -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | ${CONTAINER_RUNTIME} run -i ${IMAGE_NAME}:${TAG}"
