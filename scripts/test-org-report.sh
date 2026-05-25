#!/usr/bin/env bash
# Org profile + report image API checks (requires running API + migrated DB).
set -euo pipefail
API="${API_URL:-http://127.0.0.1:3001}"
JAR=$(mktemp)
PNG=$(mktemp).png
trap 'rm -f "$JAR" "$PNG"' EXIT

json() { curl -sS -b "$JAR" -c "$JAR" -H "Content-Type: application/json" "$@"; }

echo "== Health =="
json "$API/api/health" | jq -e '.ok == true' >/dev/null

EMAIL="org-e2e-$(date +%s)@test.local"
ORG="Org Report Test $RANDOM"
echo "== Register $EMAIL =="
json -X POST "$API/api/auth/register" -d "{\"email\":\"$EMAIL\",\"password\":\"password12\",\"name\":\"Org Admin\",\"organizationName\":\"$ORG\"}" | jq -e '.user.globalRole == "org_admin"' >/dev/null

echo "== GET org profile (auto-create) =="
json "$API/api/org/profile" | jq -e '.profile.organizationId != null' >/dev/null

echo "== PATCH org profile =="
json -X PATCH "$API/api/org/profile" -d '{
  "displayName": "Acme Controls Pty Ltd",
  "shippingAddress": "1 Shipping Lane\nSydney NSW",
  "billingAddress": "2 Billing St\nMelbourne VIC",
  "correspondenceAddress": "accounts@acme.example",
  "phone": "+61 2 9000 0000",
  "email": "sales@acme.example",
  "website": "https://acme.example",
  "taxId": "12 345 678 901"
}' | jq -e '.profile.displayName == "Acme Controls Pty Ltd"' >/dev/null
json "$API/api/org/profile" | jq -e '.profile.shippingAddress | contains("Shipping Lane")' >/dev/null

echo "== Upload report image =="
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d >"$PNG"
IMG=$(curl -sS -b "$JAR" -c "$JAR" -F "file=@$PNG;type=image/png" "$API/api/org/report-images" | jq -r '.image.id')
test -n "$IMG" && test "$IMG" != "null"
echo "image=$IMG"

echo "== Serve image file =="
curl -sS -b "$JAR" -o /dev/null -w "%{http_code}" "$API/api/org/report-images/$IMG/file" | grep -q '^200$'

echo "== Toggle include on reports =="
json -X PATCH "$API/api/org/report-images/$IMG" -d '{"includeOnReports":false}' | jq -e '.image.includeOnReports == false' >/dev/null

echo "== Create procurement for report smoke =="
OID=$(json "$API/api/auth/me" | jq -r '.user.organizationId')
CID=$(json -X POST "$API/api/clients" -d "{\"name\":\"Report Client\",\"organizationId\":\"$OID\"}" | jq -r '.client.id')
PID=$(json -X POST "$API/api/projects" -d "{\"name\":\"Report Project\",\"organizationId\":\"$OID\",\"clientId\":\"$CID\",\"status\":\"active\"}" | jq -r '.project.id')
RID=$(json -X POST "$API/api/procurement" -d "{\"projectId\":\"$PID\",\"title\":\"RFQ Test Order\",\"status\":\"draft\"}" | jq -r '.procurement.id')
json -X POST "$API/api/procurement-lines" -d "{\"procurementId\":\"$RID\",\"projectId\":\"$PID\",\"description\":\"Widget\",\"quantity\":\"5\",\"orderIndex\":0}" | jq -e '.line.id' >/dev/null

echo "== Delete report image =="
json -X DELETE "$API/api/org/report-images/$IMG" -d '{}' | jq -e '.ok == true' >/dev/null

echo ""
echo "Org profile + report API checks passed."
