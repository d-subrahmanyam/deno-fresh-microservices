# Kubernetes Target Structure

> **Status: Implemented.** The structure described in this document has been created under `kubernetes/base/` and `kubernetes/overlays/`. See [kubernetes/base/README.md](../kubernetes/base/README.md) for quick-start deploy commands.

This document turns the independent-delivery proposal into a concrete Kubernetes directory layout for this repository. The target structure is designed to let each service own its deployment lifecycle without forcing a full-stack manifest change for every release.

## Goals

- make each service deployable on its own
- make image promotion per service explicit
- keep shared infrastructure separate from application releases
- support local, dev, staging, and production overlays cleanly
- reduce merge conflicts in shared manifest files

## Current State

The current production structure is flat:

```text
kubernetes/
  01-infrastructure.yaml
  02-services.yaml
  03-autoscaling.yaml
  local/
```

This is simple, but it couples unrelated service changes because:

- multiple services share one deployment file
- autoscaling policy is grouped with the whole platform
- promotion of one service usually means editing a shared file
- ownership is unclear when one manifest contains several services

## Recommended Target Structure

Use Kustomize-friendly service-scoped directories.

```text
kubernetes/
  base/
    infrastructure/
      namespace.yaml
      postgres/
        statefulset.yaml
        service.yaml
        configmap.yaml
      redis/
        deployment.yaml
        service.yaml
      kustomization.yaml
    services/
      api-gateway/
        deployment.yaml
        service.yaml
        hpa.yaml
        pdb.yaml
        configmap.yaml
        kustomization.yaml
      products-service/
        deployment.yaml
        service.yaml
        hpa.yaml
        pdb.yaml
        configmap.yaml
        kustomization.yaml
      orders-service/
        deployment.yaml
        service.yaml
        hpa.yaml
        pdb.yaml
        configmap.yaml
        kustomization.yaml
      cart-service/
        deployment.yaml
        service.yaml
        hpa.yaml
        pdb.yaml
        configmap.yaml
        kustomization.yaml
      frontend/
        deployment.yaml
        service.yaml
        hpa.yaml
        pdb.yaml
        configmap.yaml
        kustomization.yaml
  overlays/
    dev/
      infrastructure/
        kustomization.yaml
      services/
        api-gateway/
          kustomization.yaml
          patch-deployment.yaml
        products-service/
          kustomization.yaml
          patch-deployment.yaml
        orders-service/
          kustomization.yaml
          patch-deployment.yaml
        cart-service/
          kustomization.yaml
          patch-deployment.yaml
        frontend/
          kustomization.yaml
          patch-deployment.yaml
    staging/
      infrastructure/
        kustomization.yaml
      services/
        api-gateway/
        products-service/
        orders-service/
        cart-service/
        frontend/
    production/
      infrastructure/
        kustomization.yaml
      services/
        api-gateway/
        products-service/
        orders-service/
        cart-service/
        frontend/
  local/
    README.md
    01-infrastructure.yaml
    02-services.yaml
    03-db-init.yaml
    scripts/
```

## Why This Structure

### Shared infrastructure is isolated

PostgreSQL, Redis, namespace setup, secrets, and cluster-wide concerns should not be edited during a normal service release.

### Each service has a clean ownership boundary

Each service directory contains only the manifests needed to operate that service.

### Overlays remain environment-specific

Environment differences such as replica counts, resource limits, ingress hosts, and image tags live in overlays rather than in shared base manifests.

### Service-level promotion becomes simple

To promote one service, update only that service overlay or its image reference in GitOps.

## Ownership Model For Kubernetes Paths

Recommended path ownership:

- `kubernetes/base/infrastructure/**`: platform owner
- `kubernetes/base/services/api-gateway/**`: API gateway owner
- `kubernetes/base/services/products-service/**`: products owner
- `kubernetes/base/services/orders-service/**`: orders owner
- `kubernetes/base/services/cart-service/**`: cart owner
- `kubernetes/base/services/frontend/**`: frontend owner
- `kubernetes/overlays/dev/infrastructure/**`: platform owner
- `kubernetes/overlays/*/services/<service>/**`: service owner with platform review for production-sensitive changes

## Mapping From Current Files

### Current `01-infrastructure.yaml`

Split into:

- `kubernetes/base/infrastructure/namespace.yaml`
- `kubernetes/base/infrastructure/postgres/*`
- `kubernetes/base/infrastructure/redis/*`
- environment-specific patches in `kubernetes/overlays/<env>/infrastructure/*`

### Current `02-services.yaml`

Split into:

- `kubernetes/base/services/api-gateway/*`
- `kubernetes/base/services/products-service/*`
- `kubernetes/base/services/orders-service/*`
- `kubernetes/base/services/cart-service/*`
- `kubernetes/base/services/frontend/*`

### Current `03-autoscaling.yaml`

Move the relevant HPA and disruption budget resources into each service directory:

- `kubernetes/base/services/<service>/hpa.yaml`
- `kubernetes/base/services/<service>/pdb.yaml`

This keeps scale policy tied to service ownership.

## Recommended Resource Split Per Service

Each service should own these core manifest types:

- deployment
- service
- configmap or env reference
- hpa
- pdb

Optional service-owned resources:

- networkpolicy
- ingress route when directly exposed
- service monitor or scrape config
- sealed secret or external secret reference

## Kustomize Convention

Each base service directory should contain a `kustomization.yaml` that references only that service's resources.

Example:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
  - hpa.yaml
  - pdb.yaml
  - configmap.yaml
```

Each environment overlay for a service should patch only environment-specific settings.

Example:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../../base/services/products-service
patches:
  - path: patch-deployment.yaml
images:
  - name: your-registry/microservices/products-service
    newTag: 1.7.0
```

## Deployment Commands

Examples of service-scoped deployment commands once the structure exists:

```bash
# Deploy only products-service to dev
kubectl apply -k kubernetes/overlays/dev/services/products-service

# Deploy only api-gateway to staging
kubectl apply -k kubernetes/overlays/staging/services/api-gateway

# Deploy only frontend to production
kubectl apply -k kubernetes/overlays/production/services/frontend
```

Infrastructure remains separate:

```bash
kubectl apply -k kubernetes/overlays/production/infrastructure
```

## Image Promotion Strategy

Each overlay should reference immutable image tags.

Recommended format:

- `your-registry/microservices/products-service:git-<sha>`
- `your-registry/microservices/orders-service:git-<sha>`
- `your-registry/microservices/cart-service:git-<sha>`
- `your-registry/microservices/api-gateway:git-<sha>`
- `your-registry/microservices/frontend:git-<sha>`

Promotion should mean updating only the target service image in the target environment.

## Rollback Model

Rollback should also happen per service.

Examples:

- revert only `kubernetes/overlays/production/services/orders-service`
- redeploy only the previous image tag for `products-service`
- keep infrastructure and unrelated services untouched

## Local Development Compatibility

The current `kubernetes/local` profile can stay as-is during migration. It already serves a different purpose:

- rapid local cluster deployment
- local images with `:local` tags
- reduced replicas and lower resource requests

Do not block service-level production restructuring on local-manifest cleanup.

Once the production layout is stable, you can decide whether to:

1. keep `kubernetes/local` as a simpler local profile
2. or migrate local to Kustomize overlays as well

## Migration Plan

### Stage 1: Create the new directories

- add `base/infrastructure`
- add `base/services/<service>` for each deployable unit
- add `overlays/dev`, `overlays/staging`, and `overlays/production`

### Stage 2: Move infrastructure manifests

- split PostgreSQL and Redis resources out of `01-infrastructure.yaml`
- create a dedicated infrastructure kustomization

### Stage 3: Move one service first

Start with `products-service` as the pilot.

Reason:

- isolated data ownership
- relatively straightforward runtime dependencies
- lower blast radius than gateway or frontend

### Stage 4: Migrate remaining services

Recommended order:

1. products-service
2. cart-service
3. orders-service
4. api-gateway
5. frontend

### Stage 5: Update CI/CD

- path-based pipeline triggers update service overlays only
- production promotion targets the service directory, not the whole `kubernetes` tree

### Stage 6: Retire flat manifests

- keep compatibility during the migration window
- remove `01-infrastructure.yaml`, `02-services.yaml`, and `03-autoscaling.yaml` after service overlays are in regular use

## Guardrails

- one service release should not require editing another service's manifests
- infrastructure changes should be reviewed separately from application releases
- image tags must be immutable
- service overlays must be deployable independently
- production changes should record approver, image tag, and rollback target

## Recommended First Deliverables

1. create the target directory skeleton under `kubernetes/`
2. migrate `products-service` into service-scoped base and overlay directories
3. document service-specific `kubectl apply -k` commands
4. update CI to deploy a single service overlay by path

## Final Recommendation

Use a service-scoped Kubernetes structure with shared infrastructure separated from deployable services. That gives you independent deployment paths without forcing a repository split or a platform rewrite.