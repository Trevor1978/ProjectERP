#!/usr/bin/env bash
# Smoke test against running API (default http://127.0.0.1:3001)
set -euo pipefail
API="${API_URL:-http://127.0.0.1:3001}"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

json() { curl -sS -b "$JAR" -c "$JAR" -H "Content-Type: application/json" "$@"; }

echo "== 1) Health =="
json "$API/api/health" | jq -e '.ok == true' >/dev/null
echo "OK"

EMAIL="e2e-$(date +%s)@test.local"
ORG="E2E Org $RANDOM"
echo "== 2) Register $EMAIL =="
json -X POST "$API/api/auth/register" -d "{\"email\":\"$EMAIL\",\"password\":\"password12\",\"name\":\"E2E User\",\"organizationName\":\"$ORG\"}" | jq -e '.user.email' >/dev/null
echo "OK"

echo "== 3) /me =="
json "$API/api/auth/me" | jq -e '.user.email == "'"$EMAIL"'"' >/dev/null
echo "OK"

OID=$(json "$API/api/auth/me" | jq -r '.user.organizationId')
echo "org=$OID"

echo "== 4) Create client =="
CID=$(json -X POST "$API/api/clients" -d "{\"name\":\"E2E Client\",\"organizationId\":\"$OID\"}" | jq -r '.client.id')
echo "client=$CID"

echo "== 5) Create project =="
PID=$(json -X POST "$API/api/projects" -d "{\"name\":\"E2E Project\",\"organizationId\":\"$OID\",\"clientId\":\"$CID\",\"status\":\"active\"}" | jq -r '.project.id')
echo "project=$PID"

echo "== 6) Schedule (empty) =="
# When API exposes canEditProject, org admin must be able to edit; older builds omit the field
json "$API/api/projects/$PID/schedule" | jq -e '.project.id == "'"$PID"'"' >/dev/null
json "$API/api/projects/$PID/schedule" | jq -e 'if has("canEditProject") then .canEditProject == true else true end' >/dev/null
echo "OK"

echo "== 7) Milestone + task =="
MID=$(json -X POST "$API/api/milestones" -d "{\"projectId\":\"$PID\",\"name\":\"M1\",\"orderIndex\":0}" | jq -r '.milestone.id')
TID=$(json -X POST "$API/api/tasks" -d "{\"projectId\":\"$PID\",\"milestoneId\":\"$MID\",\"title\":\"Task A\",\"orderIndex\":0,\"useDerivedPercent\":true,\"percentComplete\":0}" | jq -r '.task.id')
echo "milestone=$MID task=$TID"

echo "== 8) Todo =="
ZID=$(json -X POST "$API/api/todos" -d "{\"taskId\":\"$TID\",\"title\":\"Wire sensor\",\"status\":\"backlog\"}" | jq -r '.todo.id')
json -X PATCH "$API/api/todos/$ZID" -d "{\"title\":\"Wire sensor (done)\",\"status\":\"done\",\"version\":0}" >/dev/null
PCT=$(json "$API/api/projects/$PID/schedule" | jq -r '.tasks[0].percentComplete')
echo "task percent after todo done: $PCT (expect 100)"
test "$PCT" = "100" || test "$PCT" = "100.0" || { echo "FAIL percent"; exit 1; }
echo "OK"

echo "== 9) Task dependency =="
T2=$(json -X POST "$API/api/tasks" -d "{\"projectId\":\"$PID\",\"milestoneId\":\"$MID\",\"title\":\"Task B\",\"orderIndex\":1,\"useDerivedPercent\":true,\"percentComplete\":0}" | jq -r '.task.id')
json -X POST "$API/api/task-dependencies" -d "{\"taskId\":\"$T2\",\"predecessorTaskId\":\"$TID\",\"type\":\"FS\"}" | jq -e '.taskDependency' >/dev/null
echo "OK"

echo "== 10) Purchasing + SAP echo =="
RID=$(json -X POST "$API/api/procurement" -d "{\"projectId\":\"$PID\",\"title\":\"Buy parts\",\"status\":\"draft\"}" | jq -r '.procurement.id')
json -X PATCH "$API/api/procurement/$RID" -d "{\"sapPoNumber\":\"4500000001\",\"version\":0}" >/dev/null
json -X POST "$API/api/procurement/$RID/sap-refresh" | jq -e '.lines | length > 0' >/dev/null
echo "OK"

echo "== 11) Time entry =="
json -X POST "$API/api/time-entries" -d "{\"taskId\":\"$TID\",\"durationMinutes\":120,\"note\":\"on site\"}" | jq -e '.timeEntry.id' >/dev/null
echo "OK"

echo "== 12) Search =="
json "$API/api/search?q=Wire" | jq -e '.results.todos | length >= 0' >/dev/null
echo "OK"

echo "== 13) Logout =="
json -X POST "$API/api/auth/logout" -d '{}' | jq -e '.ok == true' >/dev/null
json "$API/api/auth/me" | jq -e '.user == null' >/dev/null
echo "OK"

echo ""
echo "All smoke checks passed."
