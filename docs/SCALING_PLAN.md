# Independent Service Delivery Scaling Plan

This plan is for scaling the current ShopHub microservices repository without splitting it into multiple repositories. The goal is to keep the codebase together while moving from an all-in build and deployment model to independent DevOps cycles per service.

## Executive Summary

The repository already contains separate deployable units:

- `frontend`
- `services/api-gateway`
- `services/products-service`
- `services/orders-service`
- `services/cart-service`
- `shared`
- `kubernetes`

Today, the operating model is still largely coordinated:

- local development starts the whole stack together
- production documentation assumes building and pushing every image together
- infrastructure manifests are grouped into a shared deployment flow
- shared code is consumed directly from the same repository state

That model is fine for early development, but it becomes a bottleneck when teams need to ship a single service without waiting for a full-repo release cycle.

The recommended direction is:

1. Keep the repository unified.
2. Move CI/CD, versioning, deployment, and ownership to the service boundary.
3. Treat shared code and API contracts as explicit dependencies instead of implicit same-commit assumptions.

## Target Operating Model

Each service should be able to:

- build independently
- test independently
- publish its own container image
- deploy independently to each environment
- roll back independently
- own its own alerts, SLOs, and release approvals

The repository should still provide:

- a full-stack local development mode for feature work
- integration and end-to-end validation for cross-service flows
- a common platform layer for shared tooling, security, observability, and policy

## Desired End State

### Delivery boundaries

- `frontend`, `api-gateway`, `products-service`, `orders-service`, and `cart-service` each have their own pipeline.
- A change under one service path should not rebuild and redeploy unrelated services unless a shared dependency changed.
- Environment promotion should happen per service, not per repository.

### Release boundaries

- Every service has its own image tag and release history.
- A service release can be promoted to staging or production without bundling unrelated code.
- Rollback targets one service image and its deployment manifest only.

### Ownership boundaries

- Each service has a clear owner or owning team.
- Shared components have an explicit maintainer.
- Deployment approvals are service-specific.

### Reliability boundaries

- Service-to-service interfaces are contract-tested.
- Shared runtime changes trigger compatibility checks before downstream release.
- Database changes follow backward-compatible migration rules.

## Recommended Repository Strategy

Do not split the repository now.

This codebase already behaves like a monorepo. The problem is not repository shape. The problem is that deployment, versioning, and operational workflows are still coordinated at the whole-system level.

Splitting into multiple repositories now would add coordination overhead before the platform fundamentals are ready. It would make local development, cross-service refactors, and shared code changes harder without solving the core release engineering problem.

The right sequence is:

1. Establish independent delivery inside the current repository.
2. Reduce shared coupling.
3. Re-evaluate repository boundaries later only if team topology or compliance requires it.

## Current Constraints In This Repository

### 1. Deployment guidance is all-in

The current production guide builds and pushes every image together, then applies shared manifests together. That is an all-in release model.

### 2. Shared code is directly imported

The `shared` directory is useful, but it creates implicit coupling because services consume the same repository state rather than a versioned internal package.

### 3. Environment configuration is service-local but not release-local

Service URLs and infrastructure assumptions are configured per deployment, but there is no documented per-service promotion strategy.

### 4. Integration flows are centralized in the gateway and frontend

The API gateway and frontend depend on multiple downstream services, so they need contract stability from those services to ship independently.

## Scaling Principles

1. Optimize for independent service releases, not independent repositories.
2. Keep local full-stack workflows for developers.
3. Require backward compatibility by default for service contracts.
4. Favor additive changes before breaking changes.
5. Move shared code toward versioned, well-defined modules.
6. Treat database evolution as a product interface, not an internal detail.
7. Keep platform standards centralized, but service releases decentralized.

## Phased Plan

## Phase 0: Baseline And Boundaries

Duration: 1 to 2 weeks

Objective: define service boundaries and stop accidental whole-repo coupling.

Actions:

- Create a service catalog with owner, runtime, dependencies, ports, data stores, dashboards, and on-call contact.
- Define path ownership for:
  - `frontend`
  - `services/api-gateway`
  - `services/products-service`
  - `services/orders-service`
  - `services/cart-service`
  - `shared`
  - `kubernetes`
- Classify every shared module as one of:
  - platform shared
  - domain shared
  - should be copied back into a service
- Define service-level quality gates:
  - formatting
  - linting
  - unit tests
  - integration tests
  - image build

Deliverables:

- service ownership matrix
- dependency map
- pipeline trigger map by directory

## Phase 1: Independent Build And Test Pipelines

Duration: 2 to 4 weeks

Objective: ensure each service can be validated and packaged independently.

Actions:

- Create one CI workflow per deployable unit.
- Trigger workflows by path changes.
- Build only the changed service image unless `shared` changed.
- Add a shared-impact rule:
  - if `shared/**` changes, run dependent service pipelines
  - if `kubernetes/**` changes, run manifest validation and targeted deployment checks
- Publish image tags per service using immutable tags such as:
  - `products-service:<git-sha>`
  - `orders-service:<git-sha>`
  - `api-gateway:<git-sha>`
- Preserve a separate full-stack integration workflow for merge-to-main or nightly runs.

Recommended pipeline shape per service:

1. detect changed paths
2. restore dependencies or cache
3. run format and lint checks
4. run service tests
5. build container image
6. scan image for vulnerabilities
7. publish image tag
8. update deployment artifact for that service only

Deliverables:

- path-based CI triggers
- per-service image publishing
- full-stack integration workflow kept separate from per-service CI

## Phase 2: Independent Deployments Per Service

Duration: 3 to 6 weeks

Objective: allow a service to move through environments without a coordinated repository release.

Actions:

- Split deployment configuration by service.
- Replace a single shared deployment update flow with service-scoped deployment artifacts.
- Introduce per-service environment overlays using one of:
  - Kustomize
  - Helm
  - service-specific manifests under `kubernetes/services/<service>`
- Promote images by tag, not by rebuilding from source for each environment.
- Record deployment metadata per service:
  - image tag
  - deployment timestamp
  - approver
  - rollback target

Recommended deployment structure:

```text
kubernetes/
  base/
    infrastructure/
    services/
      api-gateway/
      products-service/
      orders-service/
      cart-service/
      frontend/
  overlays/
    dev/
    staging/
    production/
```

Alternative if you want stricter service ownership:

```text
kubernetes/
  services/
    api-gateway/
      base/
      overlays/
    products-service/
      base/
      overlays/
    orders-service/
      base/
      overlays/
    cart-service/
      base/
      overlays/
    frontend/
      base/
      overlays/
```

Deliverables:

- service-specific deploy commands
- service-specific promotion flow
- service-specific rollback procedure

## Phase 3: Contract Stability And Shared Dependency Governance

Duration: 3 to 5 weeks

Objective: remove the need for lockstep releases caused by hidden compatibility risks.

Actions:

- Define API contracts for each service.
- Add consumer-driven contract tests where applicable.
- Require compatibility checks for gateway-to-service and frontend-to-gateway interactions.
- Version shared modules explicitly.
- Introduce a compatibility policy for `shared` changes:
  - patch changes for internal fixes
  - minor changes for additive APIs
  - major changes for breaking APIs
- Prefer extracting unstable helpers back into service-local code instead of growing `shared` indefinitely.

Specific guidance for this repository:

- `shared/types/mod.ts` should become a deliberately versioned compatibility surface.
- `shared/base-service.ts` should remain minimal and stable.
- HTTP client behavior in `shared/utils/http-client.ts` should be treated as platform code with strong backward compatibility expectations.

Deliverables:

- contract test suite
- shared module change policy
- compatibility matrix for service consumers

## Phase 4: Service-Level Observability, SLOs, And Release Controls

Duration: 2 to 4 weeks

Objective: make independent releases safe in production.

Actions:

- Add service-specific dashboards for latency, error rate, throughput, and saturation.
- Define SLOs and alert thresholds per service.
- Add deployment health checks and automated rollback triggers.
- Introduce canary or progressive rollout support for high-risk services.
- Track release health for the first 30 to 60 minutes after deployment.

Minimum production standards per service:

- health endpoint
- readiness check
- structured logs
- deployment history
- rollback command
- alert ownership

Deliverables:

- release checklist per service
- production health gates per service
- automated rollback criteria

## CI/CD Design Recommendations

### 1. Use path-based triggers

Examples:

- changes under `services/products-service/**` trigger only the products pipeline
- changes under `services/orders-service/**` trigger only the orders pipeline
- changes under `frontend/**` trigger only the frontend pipeline
- changes under `shared/**` trigger impacted services
- changes under `kubernetes/services/products-service/**` trigger manifest validation and optionally deployment for products only

### 2. Separate validation from deployment

Do not couple a merge to main with an automatic all-service rollout.

Use distinct stages:

- validate
- package
- publish
- deploy to dev
- promote to staging
- promote to production

### 3. Keep integration testing as a platform concern

Independent delivery does not remove the need for end-to-end tests.

Maintain separate workflows for:

- checkout flow
- cart enrichment through gateway
- login and session handling
- order confirmation flow

These workflows should not block unrelated service builds unless contract breakage is detected.

### 4. Prefer GitOps or deployment manifests as artifacts

The safest production model is:

- CI builds and publishes the image
- CI updates a deployment artifact for the target service
- CD or GitOps applies only that service change

## Versioning Strategy

Use per-service semantic versioning or per-service release numbers, even if the repository itself keeps a single default branch.

Recommended minimum:

- service image tag: immutable git SHA
- service release tag: human-friendly semantic or date-based version
- deployment record: environment plus image tag plus release version

Example:

- `products-service:git-4f9c2d1`
- `products-service:1.7.0`
- `orders-service:2.3.1`

Do not use a single repository version as the production release identifier for all services.

## Shared Code Strategy

The biggest risk to independent DevOps cycles in this repository is the `shared` directory.

Use these rules:

1. Shared code must be stable, generic, and intentionally maintained.
2. Domain logic should stay inside the service that owns the domain.
3. If a shared module changes frequently for only one service, move it back into that service.
4. Breaking shared changes must trigger compatibility validation for dependent services.

Practical next step:

- inventory every import from `shared/**`
- group imports by consumer service
- decide which modules are platform-grade versus incidental sharing

## Database And Schema Strategy

Independent deployments fail quickly if schema changes are not backward compatible.

Adopt these rules:

1. Expand before contract.
2. Deploy code that tolerates both old and new schema versions.
3. Remove deprecated columns or fields only after all consumers have moved.
4. Keep migrations owned by the service that owns the data.

For this repository:

- products database changes should not require simultaneous redeploy of orders or cart
- orders schema evolution should tolerate older gateway or frontend reads during rollout windows
- Redis key changes in cart should be versioned or migrated carefully

## Ownership Model

Recommended ownership layout:

- platform owner:
  - CI/CD templates
  - shared observability
  - deployment standards
  - Kubernetes base infrastructure
- service owners:
  - service code
  - service tests
  - service deployment approvals
  - service on-call and SLOs
- shared library maintainer:
  - review gate for `shared/**`
  - compatibility policy enforcement

If team size is still small, one team can hold multiple roles, but the boundaries should still be explicit.

## Success Metrics

Track whether the plan is working using these indicators:

- percentage of changes that rebuild only one service
- deployment frequency per service
- lead time from merge to production per service
- rollback rate per service
- mean time to restore per service
- number of releases requiring cross-service coordination
- number of `shared` changes that trigger downstream failures

Target outcomes after rollout:

- most feature changes build only one service and optionally the integration suite
- production rollouts happen per service
- incidents and rollback actions are isolated to one service in most cases

## Risks And Mitigations

### Risk: hidden coupling through shared code

Mitigation:

- contract tests
- compatibility policy
- limit what qualifies for `shared`

### Risk: independent deployments break end-to-end flows

Mitigation:

- keep full-stack integration tests
- require backward-compatible APIs
- add staged rollout checks

### Risk: too much operational duplication

Mitigation:

- standardize CI templates
- standardize deployment structure
- centralize platform policy, decentralize release execution

### Risk: infrastructure remains a bottleneck

Mitigation:

- separate infrastructure changes from service releases where possible
- keep shared platform changes behind controlled rollout procedures

## Recommended 90-Day Execution Plan

### Days 1 to 15

- define service ownership
- map dependencies on `shared`
- define path-based pipeline triggers
- document current build and deploy flows per service

### Days 16 to 45

- implement per-service CI workflows
- publish per-service images
- keep a separate full-stack integration workflow
- introduce service-specific deployment metadata

### Days 46 to 75

- split deployment manifests by service
- implement per-service promotion and rollback
- add compatibility checks for gateway and frontend consumers

### Days 76 to 90

- add contract tests
- finalize shared module policy
- add service-level release dashboards and alerts
- review whether any service still requires lockstep deployment and why

## Immediate Next Steps For This Repository

1. Stop treating `docs/DEPLOYMENT.md` as the only production deployment model.
2. Add a CI matrix or separate workflows keyed by service paths.
3. Refactor Kubernetes manifests so each service can be promoted independently.
4. Define ownership and release approval for each service.
5. Audit `shared/**` and mark stable versus unstable modules.
6. Add contract tests for gateway-to-service and frontend-to-gateway paths.

## Final Recommendation

Scale this system by becoming operationally multi-service inside the current repository.

Do not optimize for repo split first. Optimize for:

- service-level pipelines
- service-level deployments
- service-level ownership
- contract stability
- controlled shared dependencies

Once those are in place, you can revisit whether repository separation adds value. In most teams, that question becomes much easier to answer after independent delivery is already working.