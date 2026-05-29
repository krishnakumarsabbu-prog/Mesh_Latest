#!/bin/bash
# HealthMesh Connector Services - Stop All Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Stopping all HealthMesh connector services..."

for pidfile in "$LOG_DIR"/*.pid; do
    [ -f "$pidfile" ] || continue
    name=$(basename "$pidfile" .pid)
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid"
        echo -e "${GREEN}  Stopped ${name} (PID: ${pid})${NC}"
    else
        echo -e "${RED}  ${name} was not running (PID: ${pid})${NC}"
    fi
    rm -f "$pidfile"
done

echo "All connector services stopped."
