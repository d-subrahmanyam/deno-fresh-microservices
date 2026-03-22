# Production Deployment Guide

This guide covers deploying the microservices application to production using Kubernetes.

## Prerequisites

- Kubernetes cluster 1.24+ (managed or self-hosted)
- kubectl installed and configured
- Docker registry (Docker Hub, ECR, GCR, etc.)
- Persistent storage provisioner
- Load balancer (provided by managed K8s)

## Step 1: Build Docker Images

### Build all services

```bash
# Build and tag images
docker build -t your-registry/microservices/api-gateway:1.0.0 -f services/api-gateway/Dockerfile .
docker build -t your-registry/microservices/products-service:1.0.0 -f services/products-service/Dockerfile .
docker build -t your-registry/microservices/orders-service:1.0.0 -f services/orders-service/Dockerfile .
docker build -t your-registry/microservices/cart-service:1.0.0 -f services/cart-service/Dockerfile .
docker build -t your-registry/microservices/frontend:1.0.0 frontend/
```

### Push to registry

```bash
docker push your-registry/microservices/api-gateway:1.0.0
docker push your-registry/microservices/products-service:1.0.0
docker push your-registry/microservices/orders-service:1.0.0
docker push your-registry/microservices/cart-service:1.0.0
docker push your-registry/microservices/frontend:1.0.0
```

### Update image references

Update `kubernetes/02-services.yaml` to use your registry:

```yaml
image: your-registry/microservices/api-gateway:1.0.0
imagePullPolicy: IfNotPresent
```

## Step 2: Prepare Kubernetes Cluster

### 1. Create namespace

```bash
kubectl create namespace microservices
```

### 2. Set up storage

For production, use:
- AWS EBS, EFS
- Azure Managed Disks, BlueBook
- Google Persistent Disks
- NFS, Ceph, or other CSI drivers

Example for AWS EBS:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
```

### 3. Configure secrets

```bash
# Create database secret
kubectl create secret generic db-credentials \
  --from-literal=DB_USER=postgres \
  --from-literal=DB_PASSWORD=your-secure-password \
  -n microservices
```

## Step 3: Deploy Infrastructure

### Deploy PostgreSQL and Redis

```bash
kubectl apply -f kubernetes/01-infrastructure.yaml
```

Wait for services to be ready:

```bash
kubectl wait --for=condition=ready pod \
  -l app=postgres \
  -n microservices \
  --timeout=300s

kubectl wait --for=condition=ready pod \
  -l app=redis \
  -n microservices \
  --timeout=300s
```

### Initialize database

```bash
# Get PostgreSQL pod name
POD=$(kubectl get pods -n microservices -l app=postgres -o jsonpath='{.items[0].metadata.name}')

# Copy init script
kubectl cp database/init.sql microservices/$POD:/tmp/init.sql

# Run initialization
kubectl exec -n microservices $POD -- psql -U postgres -f /tmp/init.sql
```

## Step 4: Deploy Microservices

### Deploy services and gateways

```bash
kubectl apply -f kubernetes/02-services.yaml
```

Verify deployments:

```bash
kubectl get deployments -n microservices
kubectl get pods -n microservices
kubectl get svc -n microservices
```

### Wait for deployments to be ready

```bash
kubectl rollout status deployment/api-gateway -n microservices
kubectl rollout status deployment/products-service -n microservices
kubectl rollout status deployment/orders-service -n microservices
kubectl rollout status deployment/cart-service -n microservices
```

## Step 5: Configure Autoscaling

```bash
kubectl apply -f kubernetes/03-autoscaling.yaml
```

Monitor HPA:

```bash
kubectl get hpa -n microservices -w
```

## Step 6: Setup Ingress (Optional but recommended)

Create an Ingress controller and configuration:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: microservices-ingress
  namespace: microservices
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - api.example.com
    - shop.example.com
    secretName: tls-cert
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 80
  - host: shop.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 8000
```

Apply Ingress:

```bash
kubectl apply -f ingress.yaml
```

## Step 7: Monitoring & Logging

### Optional: Install Prometheus

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring
```

### Optional: Install Loki for logging

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install loki grafana/loki-stack -n monitoring
```

### View logs

```bash
# Stream logs from specific service
kubectl logs -n microservices -f deployment/api-gateway

# All services
kubectl logs -n microservices -f --all-containers=true
```

## Step 8: Access Applications

### Port forwarding

```bash
# API Gateway
kubectl port-forward -n microservices svc/api-gateway 3000:80

# Frontend
kubectl port-forward -n microservices svc/frontend 8000:8000

# Access:
# - API: http://localhost:3000
# - Frontend: http://localhost:8000
```

### Using Ingress

Access via your configured DNS:
- https://api.example.com
- https://shop.example.com

## Step 9: Scaling & Performance Tuning

### Manual scaling

```bash
# Scale API Gateway to 5 replicas
kubectl scale deployment api-gateway --replicas=5 -n microservices
```

### Monitor HPA decisions

```bash
kubectl get hpa -n microservices -o wide
kubectl describe hpa api-gateway-hpa -n microservices
```

### Check resource usage

```bash
kubectl top nodes
kubectl top pods -n microservices
```

## Step 10: Backup & Recovery

### Backup PostgreSQL

```bash
POD=$(kubectl get pods -n microservices -l app=postgres -o jsonpath='{.items[0].metadata.name}')

kubectl exec -n microservices $POD -- pg_dump -U postgres > backup.sql
```

### Restore PostgreSQL

```bash
POD=$(kubectl get pods -n microservices -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl cp backup.sql microservices/$POD:/tmp/backup.sql
kubectl exec -n microservices $POD -- psql -U postgres -f /tmp/backup.sql
```

## Troubleshooting Production Issues

### Pods not starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n microservices

# Check events
kubectl get events -n microservices --sort-by='.lastTimestamp'
```

### High CPU/Memory usage

```bash
# Find resource-heavy pods
kubectl top pods -n microservices --sort-by=memory

# Check resource limits
kubectl get pods -n microservices -o custom-columns=NAME:.metadata.name,CPU_LIMITS:.spec.containers[*].resources.limits.cpu,MEM_LIMITS:.spec.containers[*].resources.limits.memory
```

### Database connection issues

```bash
# Test database connectivity
kubectl run -it --rm debug --image=postgres:15-alpine -n microservices --restart=Never -- \
  psql -h postgres -U postgres -c "SELECT 1"
```

### Network problems

```bash
# Check network policies
kubectl get networkpolicies -n microservices

# Test service DNS
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  nslookup api-gateway.microservices
```

## Security Checklist

- [ ] Database credentials in Secrets (not ConfigMaps)
- [ ] Network policies restrict traffic
- [ ] Pod Security Policies enforced
- [ ] RBAC configured for service accounts
- [ ] Container images scanned for vulnerabilities
- [ ] TLS enabled for all communications
- [ ] Rate limiting configured
- [ ] Audit logging enabled

## Performance Optimization

### 1. Connection Pooling

Adjust in database deployments:
```yaml
env:
- name: PGBOUNCER_POOL_MODE
  value: "transaction"
```

### 2. Cache Optimization

Redis memory configuration:
```yaml
command:
- redis-server
- "--maxmemory=256mb"
- "--maxmemory-policy=allkeys-lru"
```

### 3. Resource Optimization

Adjust requests/limits based on metrics:
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "200m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

## Disaster Recovery

### Recovery from data loss

1. Restore from backup
2. Verify data integrity
3. Test failover procedures
4. Document recovery process

### Blue-Green Deployment

Deploy new version alongside old:

```bash
# Deploy v1.1
kubectl set image deployment/api-gateway \
  api-gateway=registry/api-gateway:1.1.0 \
  -n microservices

# Monitor for issues
kubectl rollout status deployment/api-gateway -n microservices

# If needed, rollback
kubectl rollout undo deployment/api-gateway -n microservices
```

## Cleanup

```bash
# Delete all resources
kubectl delete -f kubernetes/

# Delete namespace
kubectl delete namespace microservices
```

## Support & Resources

- Kubernetes Docs: https://kubernetes.io/docs/
- Deno Docs: https://docs.deno.com
- PostgreSQL Docs: https://www.postgresql.org/docs/
- Redis Docs: https://redis.io/documentation

## Next Steps

1. Set up CI/CD pipeline (GitHub Actions, GitLab CI, Jenkins)
2. Configure monitoring and alerts
3. Implement log aggregation
4. Setup backup schedules
5. Plan scaling strategy
6. Document runbooks
