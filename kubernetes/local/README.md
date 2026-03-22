# Local Kubernetes Deployment

This folder provides a local-cluster Kubernetes profile that uses locally built images, so you do not need to push images to a remote registry.

## What is different from the default manifests?

- Uses image tags ending with `:local`.
- Uses `imagePullPolicy: IfNotPresent` so pods can use cluster-local images.
- Uses single-replica deployments and lower default resource requests for local machines.
- Excludes autoscaling and disruption budget resources that are mostly useful in production clusters.

## Prerequisites

- Docker installed and running.
- A local Kubernetes cluster (`kind`, `minikube`, `k3d`, or `docker-desktop`).
- `kubectl` configured to point to that local cluster.

Optional tools for image import by cluster type:

- `kind` CLI for kind clusters.
- `minikube` CLI for minikube clusters.
- `k3d` CLI for k3d clusters.

## Deploy in one command

From the repository root:

```bash
./kubernetes/local/scripts/deploy.sh
```

What the deploy script does:

1. Builds all service images tagged as `microservices/<service>:local`.
2. Detects cluster type from `kubectl` context.
3. Loads local Docker images into the cluster when required.
4. Applies local manifests.
5. Waits for deployment rollouts.

## Access the app locally

Run:

```bash
./kubernetes/local/scripts/port-forward.sh
```

Then open:

- Frontend: http://localhost:8000
- API Gateway: http://localhost:3000

## Cleanup

```bash
./kubernetes/local/scripts/delete.sh
```

## Useful overrides

Environment variables supported by scripts:

- `IMAGE_PREFIX` (default: `microservices`)
- `IMAGE_TAG` (default: `local`)
- `BUILD_IMAGES` (default: `true`, set to `false` to skip rebuild on deploy)

Examples:

```bash
# Skip image rebuild if you already built images
BUILD_IMAGES=false ./kubernetes/local/scripts/deploy.sh

# Use a custom image prefix/tag
IMAGE_PREFIX=myrepo IMAGE_TAG=dev ./kubernetes/local/scripts/deploy.sh
```

## Troubleshooting

- If pods show `ImagePullBackOff`, verify image import succeeded for your cluster type.
- If deploy script cannot detect your cluster type, it still applies manifests; import images manually and re-run.
- Check pod status with:

```bash
kubectl get pods -n microservices
kubectl describe pod <pod-name> -n microservices
```
