#!/usr/bin/env bash
# API-level web push smoke test (no browser required).
set -euo pipefail
API="${API_URL:-http://127.0.0.1:3001}"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

json() { curl -sS -b "$JAR" -c "$JAR" -H "Content-Type: application/json" "$@"; }

echo "== 1) Push config (public) =="
CFG=$(curl -sS "$API/api/push/config")
echo "$CFG" | jq -e '.enabled == true and (.publicKey | length > 0)' >/dev/null
echo "OK"

EMAIL="push-api-$(date +%s)@test.local"
echo "== 2) Register $EMAIL =="
json -X POST "$API/api/auth/register" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password12\",\"name\":\"Push API\",\"organizationName\":\"Push Org\"}" \
  | jq -e '.user.email' >/dev/null
echo "OK"

echo "== 3) Push status (no subscriptions yet) =="
json "$API/api/push/status" | jq -e '.configured == true and .subscriptionCount == 0' >/dev/null
echo "OK"

echo "== 4) Subscribe (persist endpoint) =="
json -X POST "$API/api/push/subscribe" \
  -d '{"endpoint":"https://example.test/push/abc","keys":{"p256dh":"test-p256dh","auth":"test-auth"}}' \
  | jq -e '.ok == true' >/dev/null
json "$API/api/push/status" | jq -e '.subscriptionCount == 1' >/dev/null
echo "OK"

echo "== 5) Test push endpoint validates delivery =="
# Fake endpoint will fail delivery; API should report error.
CODE=$(json -X POST "$API/api/auth/profile/test-push" -d '{}' -w "%{http_code}" -o /tmp/test-push.json)
if [ "$CODE" != "400" ]; then
  echo "Expected HTTP 400 for undeliverable subscription, got $CODE"
  cat /tmp/test-push.json
  exit 1
fi
jq -e '.error | length > 0' /tmp/test-push.json >/dev/null
echo "OK (delivery failed as expected for fake endpoint)"

echo "== 6) Unsubscribe =="
json -X DELETE "$API/api/push/unsubscribe" \
  -d '{"endpoint":"https://example.test/push/abc"}' | jq -e '.ok == true' >/dev/null
json "$API/api/push/status" | jq -e '.subscriptionCount == 0' >/dev/null
echo "OK"

echo ""
echo "Web push API smoke checks passed."
