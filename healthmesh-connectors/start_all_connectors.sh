#!/bin/bash
# HealthMesh Connector Services - Start All Script
# Starts all 9 connector services starting from port 1001

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONNECTORS_DIR="$SCRIPT_DIR/connectors"
LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOG_DIR"

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================================"
echo "  HealthMesh Connector Services - Startup"
echo "========================================================"
echo ""

start_connector() {
    local name=$1
    local dir=$2
    local port=$3
    local logfile="$LOG_DIR/${name}.log"

    echo -e "${YELLOW}Starting ${name} on port ${port}...${NC}"
    cd "$CONNECTORS_DIR/$dir"

    python main.py > "$logfile" 2>&1 &
    local pid=$!
    echo $pid > "$LOG_DIR/${name}.pid"

    # Brief pause to detect immediate crash
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
        echo -e "${GREEN}  [OK] ${name} started (PID: ${pid}, port: ${port})${NC}"
    else
        echo -e "${RED}  [FAIL] ${name} failed to start. Check ${logfile}${NC}"
    fi

    cd "$SCRIPT_DIR"
}

# Connector: IBM MQ Service          -> port 1001
start_connector "ibm-mq-service"          "ibm-mq-service"          1001

# Connector: Oracle OEM Service      -> port 1002
start_connector "oracle-oem-service"      "oracle-oem-service"      1002

# Connector: MongoDB Service         -> port 1003
start_connector "mongodb-service"         "mongodb-service"          1003

# Connector: OpenShift Service       -> port 1004
start_connector "openshift-service"       "openshift-service"        1004

# Connector: AppDynamics Service     -> port 1005
start_connector "appdynamics-service"     "appdynamics-service"      1005

# Connector: Splunk Traffic Service  -> port 1006
start_connector "splunk-traffic-service"  "splunk-traffic-service"   1006

# Connector: SCOM Service            -> port 1007
start_connector "scom-service"            "scom-service"             1007

# Connector: Batch Monitor Service   -> port 1008
start_connector "batch-monitor-service"   "batch-monitor-service"    1008

# Connector: ADC Load Balancer Service -> port 1009
start_connector "adc-loadbalancer-service" "adc-loadbalancer-service" 1009

# Connector: Prometheus Service -> port 1011
start_connector "prometheus-service"      "prometheus-service"       1011

# Connector: Grafana Service -> port 1012
start_connector "grafana-service"         "grafana-service"          1012

# Connector: PCF Cloud Service -> port 1013
start_connector "pcf-service"             "pcf-service"              1013

# Connector: VM vCenter Service -> port 1014
start_connector "vm-service"              "vm-service"               1014

# Connector: ServiceNow Service -> port 1015
start_connector "servicenow-service"      "servicenow-service"       1015

# Connector: Splunk Core Service -> port 1016
start_connector "splunk-service"          "splunk-service"           1016

echo ""
echo "========================================================"
echo "  All connectors started"
echo ""
echo "  Service Registry:"
echo "    IBM MQ            -> http://localhost:1001"
echo "    Oracle OEM        -> http://localhost:1002"
echo "    MongoDB           -> http://localhost:1003"
echo "    OpenShift         -> http://localhost:1004"
echo "    AppDynamics       -> http://localhost:1005"
echo "    Splunk Traffic    -> http://localhost:1006"
echo "    SCOM              -> http://localhost:1007"
echo "    Batch Monitor     -> http://localhost:1008"
echo "    ADC Load Balancer -> http://localhost:1009"
echo "    Prometheus        -> http://localhost:1011"
echo "    Grafana           -> http://localhost:1012"
echo "    PCF Cloud         -> http://localhost:1013"
echo "    VM vCenter        -> http://localhost:1014"
echo "    ServiceNow CMDB   -> http://localhost:1015"
echo "    Splunk Core       -> http://localhost:1016"
echo ""
echo "  Logs: $LOG_DIR"
echo "  PIDs: $LOG_DIR/*.pid"
echo "========================================================"
echo ""
echo "To stop all connectors, run: $SCRIPT_DIR/stop_all_connectors.sh"
