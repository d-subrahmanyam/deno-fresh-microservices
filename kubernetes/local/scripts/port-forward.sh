#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi
  if [[ -n "${API_PID:-}" ]]; then
    kill "${API_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Forwarding frontend to http://localhost:8000"
kubectl -n microservices port-forward svc/frontend 8000:8000 >/tmp/microservices-frontend-pf.log 2>&1 &
FRONTEND_PID=$!

echo "Forwarding api gateway to http://localhost:3000"
kubectl -n microservices port-forward svc/api-gateway 3000:3000 >/tmp/microservices-api-pf.log 2>&1 &
API_PID=$!

echo "Press Ctrl+C to stop port forwarding."
wait
