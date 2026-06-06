#!/usr/bin/env bash
# Creates the ShopHub Kibana data view and saved searches.
# Run this after starting the ELK overlay:
#   docker-compose -f docker-compose.yml -f docker-compose.elk.yml up --build
#   ./observability/kibana-setup.sh

set -euo pipefail

KIBANA="http://localhost:5601"
HEADERS=('-H' 'kbn-xsrf: true' '-H' 'Content-Type: application/json')
DATA_VIEW_ID=""

wait_for_kibana() {
  echo "Waiting for Kibana to be ready..."
  for i in $(seq 1 30); do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$KIBANA/api/status" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
      echo "Kibana is ready."
      return 0
    fi
    echo "  ($i/30) status=$status — retrying in 5s..."
    sleep 5
  done
  echo "ERROR: Kibana did not become ready after 150s. Is the ELK overlay running?"
  exit 1
}

create_data_view() {
  echo ""
  echo "Creating data view: shophub-*"
  response=$(curl -s -w "\n%{http_code}" -X POST "$KIBANA/api/data_views/data_view" \
    "${HEADERS[@]}" \
    -d '{
      "data_view": {
        "title": "shophub-*",
        "name": "ShopHub Logs",
        "timeFieldName": "@timestamp"
      }
    }')
  body=$(echo "$response" | head -n -1)
  code=$(echo "$response" | tail -n1)

  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo "  Data view created (HTTP $code)."
    DATA_VIEW_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  elif echo "$body" | grep -q "Duplicate data view"; then
    echo "  Data view already exists — fetching ID."
    DATA_VIEW_ID=$(curl -s "$KIBANA/api/data_views" "${HEADERS[@]}" \
      | python3 -c "import sys,json; dvs=json.load(sys.stdin).get('data_view',[]); print(next((d['id'] for d in dvs if 'shophub' in d.get('title','')), ''))" 2>/dev/null)
  else
    echo "  WARNING: unexpected status $code — $body"
  fi

  echo "  ID: $DATA_VIEW_ID"
}

# Build the searchSourceJSON with the data view ID embedded so Kibana can
# resolve fields. Without "index", Kibana throws 'getFieldByName' errors.
make_src() {
  local query_json="$1"
  # Escape double quotes for embedding in the outer JSON string
  printf '{"index":"%s","query":{%s},"filter":[]}' "$DATA_VIEW_ID" "$query_json" \
    | sed 's/"/\\"/g'
}

create_saved_searches() {
  echo ""
  echo "Creating saved searches (referencing data view $DATA_VIEW_ID)..."

  # Delete stale copies first so re-running this script stays idempotent
  existing=$(curl -s "$KIBANA/api/saved_objects/_find?type=search&per_page=50" "${HEADERS[@]}" \
    | python3 -c "
import sys,json
objs=json.load(sys.stdin).get('saved_objects',[])
ids=[o['id'] for o in objs if 'ShopHub' in o['attributes'].get('title','')]
print(' '.join(ids))
" 2>/dev/null)
  for id in $existing; do
    curl -s -o /dev/null -X DELETE "$KIBANA/api/saved_objects/search/$id" "${HEADERS[@]}"
  done
  [ -n "$existing" ] && echo "  Removed $(echo $existing | wc -w) stale saved search(es)."

  # 1 — All errors
  curl -s -o /dev/null -X POST "$KIBANA/api/saved_objects/search" "${HEADERS[@]}" -d "{
    \"attributes\": {
      \"title\": \"ShopHub — All Errors\",
      \"description\": \"level:error across all services\",
      \"kibanaSavedObjectMeta\": {
        \"searchSourceJSON\": \"$(make_src '"query_string":{"query":"level:error","analyze_wildcard":true}')\"
      },
      \"columns\": [\"service\",\"level\",\"traceId\",\"url\",\"status\",\"errorMessage\"],
      \"sort\": [[\"@timestamp\",\"desc\"]]
    }
  }"
  echo "  [1/4] All Errors"

  # 2 — Payment domain events
  curl -s -o /dev/null -X POST "$KIBANA/api/saved_objects/search" "${HEADERS[@]}" -d "{
    \"attributes\": {
      \"title\": \"ShopHub — Payment Events\",
      \"description\": \"payment_charged and payment_declined domain events\",
      \"kibanaSavedObjectMeta\": {
        \"searchSourceJSON\": \"$(make_src '"query_string":{"query":"event:(payment_charged OR payment_declined)","analyze_wildcard":true}')\"
      },
      \"columns\": [\"service\",\"event\",\"traceId\",\"orderId\",\"userId\",\"amount\",\"provider\"],
      \"sort\": [[\"@timestamp\",\"desc\"]]
    }
  }"
  echo "  [2/4] Payment Events"

  # 3 — Slow requests
  curl -s -o /dev/null -X POST "$KIBANA/api/saved_objects/search" "${HEADERS[@]}" -d "{
    \"attributes\": {
      \"title\": \"ShopHub — Slow Requests (>500ms)\",
      \"description\": \"Requests where durationMs > 500\",
      \"kibanaSavedObjectMeta\": {
        \"searchSourceJSON\": \"$(make_src '"range":{"durationMs":{"gt":500}}')\"
      },
      \"columns\": [\"service\",\"method\",\"url\",\"status\",\"durationMs\",\"traceId\"],
      \"sort\": [[\"durationMs\",\"desc\"]]
    }
  }"
  echo "  [3/4] Slow Requests"

  # 4 — Click analytics
  curl -s -o /dev/null -X POST "$KIBANA/api/saved_objects/search" "${HEADERS[@]}" -d "{
    \"attributes\": {
      \"title\": \"ShopHub — Click Analytics\",
      \"description\": \"add_to_cart, payment_succeeded, payment_declined click events from frontend\",
      \"kibanaSavedObjectMeta\": {
        \"searchSourceJSON\": \"$(make_src '"query_string":{"query":"event:(add_to_cart OR payment_succeeded OR payment_declined) AND eventType:click_event","analyze_wildcard":true}')\"
      },
      \"columns\": [\"event\",\"userId\",\"page\",\"properties\",\"traceId\"],
      \"sort\": [[\"@timestamp\",\"desc\"]]
    }
  }"
  echo "  [4/4] Click Analytics"
}

print_next_steps() {
  echo ""
  echo "=========================================="
  echo "Setup complete."
  echo ""
  echo "Open Kibana:  http://localhost:5601"
  echo ""
  echo "Discover → select data view 'ShopHub Logs'"
  echo "Discover → Open:"
  echo "  ShopHub — All Errors"
  echo "  ShopHub — Payment Events"
  echo "  ShopHub — Slow Requests (>500ms)"
  echo "  ShopHub — Click Analytics"
  echo ""
  echo "Dashboard → Create → add Lens panels:"
  echo "  Bar chart:  count by service"
  echo "  Line chart: requests over time"
  echo "  Metric:     avg/p95 durationMs"
  echo "  Pie chart:  event breakdown (add_to_cart / payment_succeeded / payment_declined)"
  echo "=========================================="
}

wait_for_kibana
create_data_view
create_saved_searches
print_next_steps
