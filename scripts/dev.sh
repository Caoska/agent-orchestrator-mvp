#!/bin/bash

echo "🚀 Starting Agent Orchestrator..."

# Kill any existing processes
pkill -f "node.*server.js" 2>/dev/null
pkill -f "node.*worker.js" 2>/dev/null

sleep 1

# Start server
PORT=8080 node server.js > server.log 2>&1 &
SERVER_PID=$!
echo "✅ Server started (PID: $SERVER_PID)"

# Start worker
node worker.js > worker.log 2>&1 &
WORKER_PID=$!
echo "✅ Worker started (PID: $WORKER_PID)"

echo ""
echo "📊 Logs:"
echo "  Server: tail -f server.log"
echo "  Worker: tail -f worker.log"
echo ""
echo "🌐 Open: http://localhost:8080"
echo ""
echo "To stop: pkill -f 'node.*(server|worker).js'"
