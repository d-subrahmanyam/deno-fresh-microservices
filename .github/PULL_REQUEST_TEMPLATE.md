## Service affected

<!-- Which deployable unit does this change touch? Check all that apply. -->
- [ ] frontend
- [ ] api-gateway
- [ ] products-service
- [ ] orders-service
- [ ] cart-service
- [ ] shared platform code (`shared/`)
- [ ] Kubernetes platform (`kubernetes/`)
- [ ] Documentation only

## Paths changed

<!-- List the top-level paths modified (e.g. services/products-service, shared/types) -->

## What changed and why

<!-- Concise description of the change and the reason for it. -->

## Contract impact

- [ ] None — no interface or API changes
- [ ] Additive — new fields or endpoints only, fully backward compatible
- [ ] Breaking — existing consumers must update; migration plan is documented below

### Migration notes (if breaking)

<!-- Describe what downstream consumers must do and the expected rollout window. -->

## Data migration required

- [ ] No
- [ ] Yes — migration plan:

<!-- Describe any database or Redis schema changes, forward/backward compatibility window, and rollback approach. -->

## Shared code review required

- [ ] No shared code was modified
- [ ] Yes — a `shared/**` reviewer has approved this change

## Platform review required

- [ ] No Kubernetes or infrastructure files were modified
- [ ] Yes — a platform reviewer has approved this change

## Checklist

### Pre-merge
- [ ] Scope is limited to the intended service(s)
- [ ] Backward compatibility evaluated for API and data changes
- [ ] shared/ changes reviewed by shared code owner (if applicable)
- [ ] kubernetes/ changes reviewed by platform owner (if applicable)

### Build and validation
- [ ] Format and lint checks pass
- [ ] Unit tests pass
- [ ] Service integration tests pass
- [ ] Contract tests pass or explicitly marked not applicable

### Deployment readiness
- [ ] Rollback target is known
- [ ] Environment config reviewed
- [ ] Observability links ready (dashboards, alerts)

## Risk level

- [ ] Low — isolated change, tested, easy rollback
- [ ] Medium — affects user-facing flow or shared code
- [ ] High — breaking change, cross-service impact, or data migration

## Screenshots / evidence (for UI or API changes)

<!-- Attach screenshots, curl output, or test run summaries. -->

## Rollback plan

<!-- Describe how to revert this change if post-deploy issues are found. -->
