#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

kubectl delete -f "${MANIFEST_DIR}/02-services.yaml" --ignore-not-found
kubectl delete -f "${MANIFEST_DIR}/03-db-init.yaml" --ignore-not-found
kubectl delete -f "${MANIFEST_DIR}/01-infrastructure.yaml" --ignore-not-found

echo "Local Kubernetes resources deleted."
