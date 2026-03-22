#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

IMAGE_TAG="${IMAGE_TAG:-local}"
IMAGE_PREFIX="${IMAGE_PREFIX:-microservices}"
BUILD_IMAGES="${BUILD_IMAGES:-true}"

images=(
  "${IMAGE_PREFIX}/api-gateway:${IMAGE_TAG}"
  "${IMAGE_PREFIX}/products-service:${IMAGE_TAG}"
  "${IMAGE_PREFIX}/orders-service:${IMAGE_TAG}"
  "${IMAGE_PREFIX}/cart-service:${IMAGE_TAG}"
  "${IMAGE_PREFIX}/frontend:${IMAGE_TAG}"
)

detect_cluster_type() {
  local context
  context="$(kubectl config current-context 2>/dev/null || true)"

  if [[ "${context}" == kind-* ]]; then
    echo "kind"
    return
  fi

  if [[ "${context}" == minikube ]]; then
    echo "minikube"
    return
  fi

  if [[ "${context}" == k3d-* ]]; then
    echo "k3d"
    return
  fi

  if [[ "${context}" == docker-desktop ]]; then
    echo "docker-desktop"
    return
  fi

  echo "unknown"
}

load_images() {
  local cluster_type="$1"

  case "${cluster_type}" in
    kind)
      for image in "${images[@]}"; do
        kind load docker-image "${image}"
      done
      ;;
    minikube)
      for image in "${images[@]}"; do
        minikube image load "${image}"
      done
      ;;
    k3d)
      local cluster_name
      cluster_name="${K3D_CLUSTER:-${K3D_CLUSTER_NAME:-}}"
      if [[ -z "${cluster_name}" ]]; then
        cluster_name="$(k3d cluster list 2>/dev/null | awk 'NR==2 { print $1 }')"
      fi

      if [[ -z "${cluster_name}" ]]; then
        echo "Unable to determine k3d cluster name. Set K3D_CLUSTER and re-run."
        exit 1
      fi

      for image in "${images[@]}"; do
        k3d image import "${image}" -c "${cluster_name}"
      done
      ;;
    docker-desktop)
      echo "docker-desktop uses the local Docker image store; no image import step is needed."
      ;;
    *)
      echo "Unknown cluster type. Skipping image import step."
      echo "If pods fail with ImagePullBackOff, import images into your cluster manually."
      ;;
  esac
}

if [[ "${BUILD_IMAGES}" == "true" ]]; then
  "${SCRIPT_DIR}/build-images.sh"
fi

cluster_type="$(detect_cluster_type)"
echo "Detected cluster context type: ${cluster_type}"
load_images "${cluster_type}"

kubectl apply -f "${MANIFEST_DIR}/01-infrastructure.yaml"

echo "Waiting for postgres to be ready..."
kubectl rollout status statefulset/postgres -n microservices --timeout=120s

# Delete any previous db-init job so it always runs fresh on re-deploy.
kubectl delete job db-init -n microservices --ignore-not-found

kubectl apply -f "${MANIFEST_DIR}/03-db-init.yaml"

echo "Waiting for database initialisation to complete..."
kubectl wait job/db-init -n microservices --for=condition=complete --timeout=120s

kubectl apply -f "${MANIFEST_DIR}/02-services.yaml"

# Force-restart all app deployments so newly built local images with the same
# tag (:local) are always picked up.
kubectl rollout restart deployment/api-gateway deployment/products-service deployment/orders-service deployment/cart-service deployment/frontend -n microservices

kubectl rollout status deployment/api-gateway -n microservices --timeout=180s
kubectl rollout status deployment/products-service -n microservices --timeout=180s
kubectl rollout status deployment/orders-service -n microservices --timeout=180s
kubectl rollout status deployment/cart-service -n microservices --timeout=180s
kubectl rollout status deployment/frontend -n microservices --timeout=180s

echo
echo "Local deployment finished."
echo "Use scripts/port-forward.sh to expose services on localhost (8000 and 3000)."
