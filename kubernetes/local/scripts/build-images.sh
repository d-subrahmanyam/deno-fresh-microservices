#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

IMAGE_TAG="${IMAGE_TAG:-local}"
IMAGE_PREFIX="${IMAGE_PREFIX:-microservices}"

build_image() {
  local image_name="$1"
  local dockerfile="$2"
  local context_dir="$3"

  echo "Building ${IMAGE_PREFIX}/${image_name}:${IMAGE_TAG}"
  docker build \
    -f "${REPO_ROOT}/${dockerfile}" \
    -t "${IMAGE_PREFIX}/${image_name}:${IMAGE_TAG}" \
    "${REPO_ROOT}/${context_dir}"
}

build_image "api-gateway" "services/api-gateway/Dockerfile" "."
build_image "products-service" "services/products-service/Dockerfile" "."
build_image "orders-service" "services/orders-service/Dockerfile" "."
build_image "cart-service" "services/cart-service/Dockerfile" "."
build_image "frontend" "frontend/Dockerfile" "frontend"

echo "All local images were built successfully."
