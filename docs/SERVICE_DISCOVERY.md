# Service Discovery Architecture Guide

## Current Status

**Our system does NOT currently use Consul, Eureka, or any dedicated service discovery server.**

Instead, we use a simpler approach:
- **Docker Compose networking** - Services discover each other via automatic container DNS
- **Hardcoded environment variables** - Service URLs are defined statically in configuration
- **Kubernetes Service discovery** (optional) - Built-in DNS when deployed to K8s

### Current Service Discovery Method

```
API Gateway (Port 3000)
├─ PRODUCTS_SERVICE_URL=http://products-service:3003
├─ ORDERS_SERVICE_URL=http://orders-service:3004
└─ CART_SERVICE_URL=http://cart-service:3005
```

When running in Docker Compose, the container name automatically resolves to the container's IP address. No external service discovery needed.

---

## Architecture Comparison

### Option 1: Current Approach (No Discovery Server) ✅ RECOMMENDED TODAY

**What we're using RIGHT NOW**

```
Service → Environment Variable → Direct HTTP Call
│
└─ Works because Docker Compose provides automatic DNS
```

#### Pros ✅
- **Simplicity** - No additional infrastructure to manage
- **Performance** - Direct calls, no service lookup overhead (~1ms latency)
- **Clarity** - Explicit service URLs make debugging easy
- **Docker Compose** - Works perfectly for local development
- **Kubernetes Ready** - Kubernetes has its own service discovery (see Option 3)
- **Low Operational Burden** - No cluster to maintain

#### Cons ❌
- **Static Configuration** - Service URLs must be known in advance
- **No Dynamic Scaling** - Can't add/remove instances without redeploying
- **Manual Updates** - Changes require environment variable updates
- **Not Cloud-Native** - Doesn't scale with modern orchestration patterns
- **Limited Multi-Instance** - Doesn't load-balance across multiple service instances

#### When to Use
- ✅ Local development (current use case)
- ✅ Single-instance deployments
- ✅ Small teams with predictable infrastructure
- ✅ Testing and prototyping (current phase)

#### Implementation Effort
- **Setup time:** Already implemented (5 minutes)
- **Maintenance:** Minimal (just update env vars when needed)
- **Learning curve:** None

---

### Option 2: Consul 🔷 Enterprise-Grade Discovery

**Full-featured service mesh and discovery platform**

```
Service (Agent)
    ↓
    [Registers itself with local Consul Agent]
    ↓
[Consul Client] ← Queries → [Consul Server Cluster]
    ↓
[Returns available services + health status]
    ↓
[Load balance across healthy instances]
```

#### Pros ✅
- **Dynamic Registration** - Services auto-register on startup, deregister on shutdown
- **Health Checks** - Automatic detection of failed services
- **Load Balancing** - Distributes requests across multiple instances
- **Failover** - Automatically routes around failed nodes
- **Multi-Datacenter** - Supports geographically distributed deployments
- **KV Store** - Centralized configuration management
- **GUI Dashboard** - Visual service status monitoring
- **DNS Interface** - Query services via DNS (servicename.service.consul)

#### Cons ❌
- **Infrastructure Overhead** - Requires 3+ Consul servers minimum for HA
- **Operational Complexity** - Cluster management, backups, updates
- **Network Latency** - Service lookup adds ~5-10ms to each request
- **Resource Usage** - Memory and CPU overhead per service
- **Learning Curve** - Team must understand Consul concepts (agents, servers, DCs)
- **Overkill for Small Systems** - 4 services don't need Consul's power
- **Cost** - Infrastructure, management tools, operator training

#### Architecture Example
```
Docker Host 1            Docker Host 2          Docker Host 3
│                        │                      │
├─ Consul Agent         ├─ Consul Agent        ├─ Consul Agent
├─ Products Service     ├─ Orders Service      ├─ Cart Service
└─ Orders Service       └─ Cart Service        └─ Products Service
                                                   (replica)

        All agents sync with Consul Server cluster
```

#### When to Use
- 🔲 20+ microservices
- 🔲 Multi-datacenter deployments
- 🔲 Services frequently added/removed (auto-scaling)
- 🔲 Need service mesh features (circuit breaking, retries)
- 🔲 VMs or bare metal infrastructure

#### Implementation Effort
- **Setup time:** 2-3 hours
- **Maintenance:** High (cluster management, monitoring)
- **Learning curve:** Steep (requires understanding of consensus, clustering)

#### Cost Estimate
```
Consul Servers (3 instances):    $300+/month
Add-on tooling:                  $100+/month
Operator time:                   8-16 hours/month
───────────────────────────────
Total: ~$400-500/month + ongoing ops
```

---

### Option 3: Kubernetes Service Discovery 🟦 Built-In & Elegant

**Automatic service discovery when running on Kubernetes**

```
Service Definition (ClusterIP)
    ↓
[Kubernetes DNS]  ←  Automatically discovers pods
    ↓
Internal DNS: products-service.default.svc.cluster.local
    ↓
Routes to any healthy pod behind service
```

#### Pros ✅
- **Built-In** - No additional tools or configuration needed
- **Automatic** - Services discovered automatically via DNS
- **Load Balancing** - Native round-robin across pod replicas
- **Health Management** - Readiness/liveness probes handle failures
- **Rolling Updates** - Seamlessly handles deployments with zero downtime
- **Scaling** - Automatic endpoint updates when pods scale
- **Zero Overhead** - No external service lookup (uses CoreDNS)
- **Works with Everything** - Integrates with Prometheus, Istio, etc.
- **Standard** - Industry-standard container orchestration

#### Cons ❌
- **Kubernetes Dependency** - Requires running Kubernetes
- **Not Portable** - Doesn't work outside K8s (ties you to platform)
- **Learning Curve** - Team must understand Kubernetes concepts
- **Infrastructure Cost** - K8s cluster can be expensive (see cost section)

#### Kubernetes DNS Resolution
```yaml
# In Gateway deployment, just use:
apiVersion: v1
kind: Service
metadata:
  name: products-service

# Then access as:
HTTP GET http://products-service:3003/api/products

# Kubernetes DNS automatically finds the pods!
# Works within cluster, handled by CoreDNS
```

#### When to Use
- ✅ Already deployed on Kubernetes
- ✅ Need automatic scaling
- ✅ Multi-instance services common
- ✅ Large production systems
- ✅ Using managed K8s (EKS, GKE, AKS)

#### Implementation Effort
- **Setup time:** 1-2 hours (Kubernetes setup)
- **Maintenance:** Kubernetes cluster ops
- **Learning curve:** Moderate (Kubernetes knowledge required)

#### Cost Estimate
```
Self-managed K8s:       $0-500/month (infrastructure)
Managed K8s (AWS EKS):  $500-2000+/month
Operator time:          10-20 hours/month
───────────────────────────────
Total: $500-2000+/month + ongoing ops
```

---

### Option 4: Lightweight Alternative - Traefik 🟢 Good Middle Ground

**Reverse proxy with automatic service discovery**

```
Traefik Reverse Proxy
    ↓ Auto-discovers services
[Docker labels or k8s annotations]
    ↓
Routes to available instances + load balances
```

#### Pros ✅
- **Lighter than Consul** - Less infrastructure needed
- **Self-Discovering** - Works with Docker, Kubernetes, Consul, etc.
- **Load Balancing** - Built-in LB without separate cluster
- **API Gateway** - Doubles as reverse proxy and gateway
- **Health Checks** - Built-in service health monitoring
- **Simpler operations** - Single container to manage

#### Cons ❌
- **Not a full service mesh** - Limited compared to Consul/Istio
- **Different model** - Routes via proxy instead of DNS

#### When to Use
- ✅ Need something between current approach and full Consul
- ✅ Docker Compose with multiple instances
- ✅ Want API Gateway + service discovery combined

---

## Recommendation Matrix

| Scenario | Recommendation | Why |
|----------|---|---|
| **Current (4 services, dev team)** | ✅ Keep current approach | Simple, works, no overhead |
| **Growing to 10+ services** | 🔷 Evaluate Consul | Complexity justifies solution |
| **Deploying to Kubernetes** | 🟦 Use K8s built-in | Free, powerful, standard |
| **Local multi-instance dev** | 🟢 Add Traefik | Lightweight middle ground |
| **Complex rule routing needed** | 🟢 Add Traefik/Istio | More control than simple DNS |

---

## Implementation Roadmap

### Phase 1: TODAY ✅ CURRENT
```
Keep current approach - No changes needed
- Hardcoded environment variables
- Docker Compose DNS resolution
- Manual configuration
```

**Action:** Continue as-is. System works well.

---

### Phase 2: FUTURE (When You Have 15+ Services)
```
Option A: Deploy to Kubernetes
- Use built-in service discovery
- Automatic load balancing
- Scales with business

Option B: Add Consul Cluster
- For non-K8s deployments
- Complex inter-service requirements
- Multi-datacenter needs
```

**Action:** Plan transition when service count justifies complexity.

---

### Phase 3: ADVANCED (Service Mesh Optional)
```
Consider service mesh layer:
- Consul Connect
- Istio
- Linkerd

Handles:
- Mutual TLS
- Advanced routing
- Observability
- Security policies
```

**Action:** Only after Consul/K8s stabilization.

---

## Current System: Docker Compose Service Discovery

### How It Works Today

```yaml
# docker-compose.yml
services:
  api-gateway:
    environment:
      PRODUCTS_SERVICE_URL: http://products-service:3003
      ORDERS_SERVICE_URL: http://orders-service:3004
      CART_SERVICE_URL: http://cart-service:3005
    networks:
      - microservices

  products-service:
    networks:
      - microservices

  orders-service:
    networks:
      - microservices

  cart-service:
    networks:
      - microservices

networks:
  microservices:
    driver: bridge
```

### What Happens
1. Docker Compose creates a bridge network called `microservices`
2. Each service connects to this network
3. Docker's embedded DNS server (`127.0.0.11:53`) is available in each container
4. `products-service` hostname resolves to that container's IP automatically
5. API Gateway uses environment variables to know the URLs
6. HTTP requests go directly to target service

### DNS Resolution Example
```bash
# Inside api-gateway container
$ nslookup products-service
Server:  127.0.0.11
Address: 127.0.0.11#53

Name:  products-service
Address: 172.20.0.3  # Docker assigns this automatically

# Request gets routed to that IP:3003
```

### Limitations
- ❌ Can't add new `products-service` instances (would need separate ports)
- ❌ No health checks (failed service still appears "available")
- ❌ No automatic load balancing across replicas
- ❌ Services must be known when containers start

---

## Migration Path: Current → Kubernetes

When you're ready to scale:

### Step 1: Environment → Kubernetes Services
```yaml
# Current (env vars)
PRODUCTS_SERVICE_URL: http://products-service:3003

# Kubernetes (automatic DNS)
# Just use: http://products-service:3003
# K8s DNS handles everything automatically!
```

### Step 2: StaticPods → Deployments
```yaml
# Replicas handled automatically
apiVersion: apps/v1
kind: Deployment
metadata:
  name: products-service
spec:
  replicas: 3  # Auto load-balance
  selector:
    matchLabels:
      app: products-service
  template:
    metadata:
      labels:
        app: products-service
    spec:
      containers:
      - name: products
        image: products-service:1.0.0
```

### Step 3: Done!
That's it. Kubernetes handles service discovery, load balancing, health checks, and scaling automatically.

---

## Migration Path: Current → Consul (If Needed)

### Step 1: Add Consul Servers
```docker-compose.yml
consul-server:
  image: consul:latest
  ports:
    - "8500:8500"
```

### Step 2: Register Services
```yaml
# Add to each service
consul:
  - name: products-service
    port: 3003
    health_check: http:3003/health
```

### Step 3: Use Consul DNS
```yaml
# Replace
PRODUCTS_SERVICE_URL: http://products-service.service.consul
```

### Step 4: Done! But...
- More infrastructure to manage
- Higher latency (DNS lookups)
- Operational overhead significantly increases

---

## Decision Flowchart

```
Are you using Kubernetes?
│
├─ YES → Use Kubernetes service discovery ✅
│        (built-in, no config needed)
│
└─ NO → Do you have 15+ services?
        │
        ├─ YES → Consider Consul 🔷
        │        (complexity justified)
        │
        └─ NO → Keep current approach ✅
                (simple, works great)
                │
                └─ Want multiple instances locally?
                   │
                   ├─ YES → Add Traefik 🟢
                   │        (lightweight discovery)
                   │
                   └─ NO → Status quo is perfect ✅
```

---

## Summary

| Aspect | Current | Consul | Kubernetes | Traefik |
|--------|---------|--------|------------|---------|
| **Setup Time** | Done ✅ | 2-3h | 1-2h | 1h |
| **Complexity** | Very Low | High | Medium | Low-Medium |
| **Performance** | ~1ms | ~5-10ms | ~1ms | ~2-5ms |
| **Auto-Scaling** | Manual | Automatic | Automatic | Limited |
| **Best For** | Current Phase | Enterprise | Modern Cloud | Hybrid |
| **Cost** | $0 | $400+/mo | $500-2000/mo | ~$100/mo |
| **Team Size** | Any | 10+ people | Any | Any |
| **Recommended?** | ✅ YES | 🔲 Later | ✅ If Moving | 🟢 Maybe |

---

## Action Items

### Immediate
- [x] Document current architecture (this document)
- [ ] Continue with current approach (no changes needed)
- [ ] Focus on features, not infrastructure complexity

### If Scaling (15+ services)
- [ ] Evaluate Kubernetes adoption
- [ ] Plan Consul cluster if not using K8s
- [ ] Train team on chosen platform

### Not Needed Right Now
- ❌ Consul cluster setup
- ❌ Service mesh implementation
- ❌ Kubernetes migration
- ❌ Changes to current DNS approach

---

## References & Resources

### Our Current Setup
- [Docker Compose Networking](https://docs.docker.com/compose/networking/)
- [Embedded DNS Server](https://docs.docker.com/config/containers/container-networking/)

### Consul
- [Consul Documentation](https://www.consul.io/docs)
- [Service Mesh Pattern](https://martinfowler.com/articles/patterns-of-distributed-systems/service-mesh.html)

### Kubernetes
- [Kubernetes Service Discovery](https://kubernetes.io/docs/concepts/services-networking/service/)
- [CoreDNS in Kubernetes](https://coredns.io/)

### Traefik
- [Traefik Documentation](https://doc.traefik.io/)
- [Traefik Service Discovery](https://doc.traefik.io/traefik/routing/overview/)

---

## Questions?

**Q: Do we need service discovery right now?**  
A: No. Current approach works perfectly for 4 services.

**Q: When should we implement it?**  
A: When you have 15+ services or move to Kubernetes.

**Q: What's the risk of waiting?**  
A: None. Easy to migrate later when justified by scale.

**Q: What if we change our mind?**  
A: Each option is designed to be backward compatible with the others.

**Q: Which is easiest to implement?**  
A: Kubernetes (if you're already using it) or keeping current approach.

---

**Last Updated:** March 2026  
**Status:** Document version 1.0 - Recommendation: No Action Needed (Current approach optimal)
