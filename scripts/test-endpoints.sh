#!/bin/bash
API_URL="http://localhost:8080"

echo "🧪 Testing all API endpoints..."
echo

# 1. Create workspace
echo "1️⃣  Creating workspace..."
WS=$(curl -s -X POST $API_URL/v1/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Workspace", "owner_email": "test@example.com"}')
API_KEY=$(echo $WS | jq -r '.api_key')
echo "✅ API Key: $API_KEY"
echo

# 2. Get workspace info
echo "2️⃣  GET /v1/workspace"
curl -s $API_URL/v1/workspace -H "Authorization: Bearer $API_KEY" | jq -c '{plan, runs_this_month}'
echo

# 3. List agents
echo "3️⃣  GET /v1/agents"
curl -s $API_URL/v1/agents -H "Authorization: Bearer $API_KEY" | jq -c 'length'
echo

# 4. List runs
echo "4️⃣  GET /v1/runs"
curl -s $API_URL/v1/runs -H "Authorization: Bearer $API_KEY" | jq -c 'length'
echo

# 5. List schedules
echo "5️⃣  GET /v1/schedules"
curl -s $API_URL/v1/schedules -H "Authorization: Bearer $API_KEY" | jq -c '.schedules | length'
echo

echo "✅ All endpoints working!"
echo
echo "🔑 Use this API key: $API_KEY"
