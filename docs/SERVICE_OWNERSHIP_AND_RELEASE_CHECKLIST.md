# Service Ownership Matrix And Release Checklist

This document is a working template for assigning service ownership and standardizing service-level releases. It is designed for a repository that stays unified while services gain independent DevOps cycles.

## How To Use This Document

1. Fill in the ownership matrix with real names, groups, and links.
2. Keep one row per deployable unit.
3. Use the release checklist for every service deployment.
4. Add service-specific steps where a component has extra operational risk.

## Ownership Matrix

| Service | Business Role | Code Path | Runtime Owner | Deployment Approver | On-Call Group | Runbook | Dashboard | Data Stores | Upstream Dependencies | Downstream Consumers | Deploy Trigger Path |
|---------|---------------|-----------|---------------|---------------------|---------------|---------|-----------|-------------|-----------------------|----------------------|---------------------|
| Frontend | Customer UI and session flow | `frontend/` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | None directly | `api-gateway` | End users | `frontend/**` |
| API Gateway | Public API, routing, aggregation | `services/api-gateway/` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | None directly | `products-service`, `orders-service`, `cart-service` | `frontend` | `services/api-gateway/**` |
| Products Service | Product catalog and search | `services/products-service/` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | PostgreSQL | PostgreSQL | `api-gateway` | `services/products-service/**` |
| Orders Service | Order lifecycle and persistence | `services/orders-service/` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | PostgreSQL, Redis | PostgreSQL, Redis | `api-gateway` | `services/orders-service/**` |
| Cart Service | Cart state and cart TTL | `services/cart-service/` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | Redis | Redis | `api-gateway` | `services/cart-service/**` |
| Shared Platform Code | Shared runtime utilities and types | `shared/` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | None | None | All services | `shared/**` |
| Kubernetes Platform | Cluster deployment assets | `kubernetes/` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | Cluster resources | Registry, cluster infra | All services | `kubernetes/**` |

## Ownership Rules

### Runtime owner

The runtime owner is responsible for:

- code changes in the service path
- service tests and contract compatibility
- release readiness
- rollback coordination
- service SLOs and alerts

### Deployment approver

The deployment approver is responsible for:

- production promotion approval
- verifying release notes and risk level
- confirming rollback target exists

### Shared code owner

The `shared/` owner should review:

- interface changes
- shared type changes
- HTTP client behavior changes
- base runtime behavior changes used across services

### Platform owner

The Kubernetes or platform owner should review:

- infrastructure changes
- cluster-wide policy updates
- ingress, secrets, storage, and namespace changes
- production overlay changes that affect resiliency or security posture

## Release Metadata Template

Use this template in PRs, deployment records, or change tickets.

```text
Service:
Environment:
Image Tag:
Release Version:
Change Type: feature | fix | config | dependency | migration
Owner:
Approver:
Risk Level: low | medium | high
Rollback Target:
Dashboard Link:
Runbook Link:
Contract Impact: none | additive | breaking
Data Migration Required: yes | no
Post-Deploy Validation Window:
Notes:
```

## Service Release Checklist

Use this checklist for each service deployment.

### Pre-merge

- scope of change is clear and limited to the intended service
- service owner reviewed the change
- changes to `shared/` were reviewed by the shared code owner
- changes to `kubernetes/` were reviewed by the platform owner when required
- backward compatibility was evaluated for API and data changes
- user-facing or consumer-facing contract changes are documented

### Build And Validation

- formatting and lint checks passed
- unit tests passed
- service integration tests passed
- contract tests passed or were explicitly marked not applicable
- image build completed successfully
- image vulnerability scan completed
- release artifact or image tag is immutable

### Deployment Readiness

- deployment target environment is identified
- environment-specific configuration has been reviewed
- required secrets and config values exist
- rollback image tag is known and available
- migration plan is documented if schema or data changes are involved
- observability links are ready before deployment

### Deployment Approval

- service owner approved deployment
- production approver approved deployment if required
- risk level is declared
- release metadata is recorded

### Post-deploy Verification

- deployment rollout completed successfully
- health endpoint is healthy
- readiness is healthy
- error rate is normal
- latency is within expected range
- key business flow for that service was verified
- logs show no new critical errors

### Rollback Decision Gate

- rollback threshold is defined before deployment
- owner knows which symptoms require immediate rollback
- rollback command or manifest target is ready

### Post-release Closeout

- deployment timestamp was recorded
- final image tag was recorded
- release notes were updated if needed
- follow-up issues were captured
- incident review was created if rollout caused customer impact

## Service-Specific Validation Suggestions

### Frontend

- login page loads
- product listing loads
- cart page loads
- checkout flow renders correctly
- browser console has no critical errors

### API Gateway

- `/health` returns healthy
- gateway can reach downstream services
- cart enrichment endpoint responds correctly
- rate limiting behavior remains acceptable

### Products Service

- product listing works
- single product fetch works
- search and category filter work
- database connectivity is healthy

### Orders Service

- order creation works
- order lookup works
- status transition rules still behave correctly
- Redis event publishing works if enabled

### Cart Service

- cart fetch works
- add item works
- update quantity works
- clear cart works
- Redis connectivity is healthy

## Recommended PR Template Fields

For service delivery, each release-oriented PR should capture:

- service affected
- paths changed
- whether `shared/` changed
- whether `kubernetes/` changed
- contract impact
- migration impact
- rollback target
- validation evidence

## Escalation Rules

Escalate to the platform owner when:

- a change affects cluster-wide resources
- secret handling changes
- ingress changes
- storage class or persistent volume behavior changes
- multiple service overlays need coordinated change

Escalate to shared code ownership when:

- `shared/types/mod.ts` changes
- `shared/base-service.ts` changes
- `shared/utils/http-client.ts` changes

## Recommended First Pass Assignments

Complete these fields first:

1. runtime owner
2. deployment approver
3. runbook link
4. dashboard link
5. rollback target convention

That is enough to start independent deployments with accountability.