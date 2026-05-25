#!/usr/bin/env bash
set -euo pipefail
API="${API_URL:-http://127.0.0.1:3001}"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
json() { curl -sS -b "$JAR" -c "$JAR" -H "Content-Type: application/json" "$@"; }

json "$API/api/health" | jq -e '.ok == true' >/dev/null
EMAIL="item-e2e-$(date +%s)@test.local"
json -X POST "$API/api/auth/register" -d "{\"email\":\"$EMAIL\",\"password\":\"password12\",\"name\":\"U\",\"organizationName\":\"Item Org $RANDOM\"}" >/dev/null
OID=$(json "$API/api/auth/me" | jq -r '.user.organizationId')
CID=$(json -X POST "$API/api/clients" -d "{\"name\":\"C\",\"organizationId\":\"$OID\"}" | jq -r '.client.id')
PID=$(json -X POST "$API/api/projects" -d "{\"name\":\"P\",\"organizationId\":\"$OID\",\"clientId\":\"$CID\",\"status\":\"active\"}" | jq -r '.project.id')

ITEM=$(json -X POST "$API/api/project-items" -d "{\"projectId\":\"$PID\",\"kind\":\"software\",\"description\":\"PLC license\",\"quantity\":\"2\"}" | jq -r '.item.id')
json "$API/api/projects/$PID/items" | jq -e '.items | length >= 1' >/dev/null

RID=$(json -X POST "$API/api/procurement" -d '{"title":"PO for items","status":"draft"}' | jq -r '.procurement.id')
LINE=$(json -X POST "$API/api/procurement-lines" -d "{\"procurementId\":\"$RID\",\"projectId\":\"$PID\",\"projectItemId\":\"$ITEM\",\"description\":\"PLC license\",\"quantity\":\"2\",\"createProjectItem\":false}" | jq -r '.line.id')
test -n "$LINE"

json "$API/api/projects/$PID/items" | jq -e '.items[0].linkedLineCount >= 1' >/dev/null
echo "Project items API checks passed."
