# Kubernetes Base and Overlays

This directory contains a Kustomize-based layout for independent per-service deployments. It is the target structure described in [docs/KUBERNETES_TARGET_STRUCTURE.md](../../docs/KUBERNETES_TARGET_STRUCTURE.md).

The flat manifests (`01-infrastructure.yaml`, `02-services.yaml`, `03-autoscaling.yaml`) remain in the parent directory during the migration window and continue to work as before.

## Directory Layout

```
base/
  infrastructure/        Namespace, ConfigMap, Secret, Postgres, Redis, NetworkPolicy
  services/
    api-gateway/         Deployment, Service, HPA, PDB
    products-service/    Deployment, Service, HPA, PDB
    orders-service/      Deployment, Service, HPA, PDB
    cart-service/        Deployment, Service, HPA, PDB
    frontend/            Deployment, Service
overlays/
  dev/                   Single replica, latest image tag
  staging/               Base replicas, immutable image tag set by CI
  production/            Base replicas, immutable image tag set after approval
```

## Deploy a single service

Replace `<env>` with `dev`, `staging`, or `production`.
Replace `<service>` with `api-gateway`, `products-service`, `orders-service`, `cart-service`, or `frontend`.

```bash
kubectl apply -k kubernetes/overlays/<env>/services/<service>
```

Examples:

```bash
# Deploy products-service to dev
kubectl apply -k kubernetes/overlays/dev/services/products-service

# Deploy api-gateway to staging with a specific image tag
cd kubernetes/overlays/staging/services/api-gateway
kustomize edit set image microservices/api-gateway=your-registry/microservices/api-gateway:git-4f9c2d1
kubectl apply -k .

# Deploy orders-service to production after approval
cd kubernetes/overlays/production/services/orders-service
kustomize edit set image microservices/orders-service=your-registry/microservices/orders-service:git-7a3b1e9
kubectl apply -k .
```

## Deploy infrastructure only

```bash
kubectl apply -k kubernetes/overlays/<env>/infrastructure
```

## Rollback a single service

```bash
# Revert the overlay to the previous image tag, then re-apply
cd kubernetes/overlays/production/services/products-service
kustomize edit set image microservices/products-service=your-registry/microservices/products-service:git-<previous-sha>
kubectl apply -k .

# Or use kubectl rollout undo for an immediate in-cluster rollback
kubectl rollout undo deployment/products-service -n microservices
```

## Check rollout status for a single service

```bash
kubectl rollout status deployment/products-service -n microservices
kubectl get pods -n microservices -l app=products-service
```

## Image tag convention

- Dev: `latest` (rebuilt on each push during active development)
- Staging: `git-<sha>` (set by CI pipeline after successful build)
- Production: `git-<sha>` (same SHA as staging after approval)

Never use `latest` in staging or production.

## Secrets

The `base/infrastructure/secrets.yaml` file is a placeholder for local and dev use only.

For staging and production:
- Use [sealed-secrets](https://github.com/bitnami-labs/sealed-secrets) or an external secrets operator.
- Do not commit real credentials.
- Create secrets out-of-band or via GitOps-compatible tooling before applying overlays.
