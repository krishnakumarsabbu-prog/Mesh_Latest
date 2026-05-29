import os
import pandas as pd

def generate_all_samples():
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "samples"))
    os.makedirs(output_dir, exist_ok=True)
    print(f"Generating mock telemetry sheets in {output_dir}...")

    # 1. IBM MQ
    # ibmmq_qmgr_server_status.xlsx
    df_qmgr = pd.DataFrame([
        {"queue_manager_name": "mq4uprdga", "status": "RUNNING", "host": "10.23.4.11", "port": 1414, "channel_count": 15, "queue_count": 45},
        {"queue_manager_name": "mq4uprdma", "status": "RUNNING", "host": "10.23.5.12", "port": 1414, "channel_count": 12, "queue_count": 30},
        {"queue_manager_name": "mq4udrga", "status": "STOPPED", "host": "10.23.8.11", "port": 1414, "channel_count": 0, "queue_count": 45}
    ])
    df_qmgr.to_excel(os.path.join(output_dir, "ibmmq_qmgr_server_status.xlsx"), index=False)

    # queue_depth_samples.xlsx
    df_qdepth = pd.DataFrame([
        {"queue_name": "PATIENT_PORTAL_QUEUE", "queue_manager_name": "mq4uprdga", "current_depth": 4500, "max_depth": 5000, "open_input_count": 4, "open_output_count": 2},
        {"queue_name": "BILLING_TRANS_QUEUE", "queue_manager_name": "mq4uprdga", "current_depth": 150, "max_depth": 10000, "open_input_count": 8, "open_output_count": 8},
        {"queue_name": "PRESCRIPTION_ORDER_QUEUE", "queue_manager_name": "mq4uprdma", "current_depth": 9200, "max_depth": 10000, "open_input_count": 1, "open_output_count": 1}
    ])
    df_qdepth.to_excel(os.path.join(output_dir, "queue_depth_samples.xlsx"), index=False)

    # 2. Oracle OEM
    # oem_db_role.xlsx
    df_db_role = pd.DataFrame([
        {"database_name": "hmprd_db1", "status": "OPEN", "db_role": "PRIMARY", "host": "ibb1-ora-01.healthmesh.ai", "port": 1521},
        {"database_name": "hmprd_db2", "status": "OPEN", "db_role": "PHYSICAL STANDBY", "host": "shv-ora-02.healthmesh.ai", "port": 1521},
        {"database_name": "hmdr_db1", "status": "DOWN", "db_role": "PHYSICAL STANDBY", "host": "shv-ora-dr.healthmesh.ai", "port": 1521}
    ])
    df_db_role.to_excel(os.path.join(output_dir, "oem_db_role.xlsx"), index=False)

    # oracle_replica_status.xlsx
    df_ora_repl = pd.DataFrame([
        {"database_name": "hmprd_db2", "replication_lag_seconds": 15, "dr_ready": True},
        {"database_name": "hmdr_db1", "replication_lag_seconds": 3600, "dr_ready": False}
    ])
    df_ora_repl.to_excel(os.path.join(output_dir, "oracle_replica_status.xlsx"), index=False)

    # 3. MongoDB
    # mongodb_info.xlsx
    df_mongo_info = pd.DataFrame([
        {"replica_set_name": "rs_patient", "node_name": "rs_patient_node1", "role": "PRIMARY", "status": "ONLINE", "host": "10.40.2.20", "port": 27017},
        {"replica_set_name": "rs_patient", "node_name": "rs_patient_node2", "role": "SECONDARY", "status": "ONLINE", "host": "10.40.2.21", "port": 27017},
        {"replica_set_name": "rs_patient", "node_name": "rs_patient_node3", "role": "SECONDARY", "status": "OFFLINE", "host": "10.40.2.22", "port": 27017}
    ])
    df_mongo_info.to_excel(os.path.join(output_dir, "mongodb_info.xlsx"), index=False)

    # mongo_replica_status.xlsx
    df_mongo_repl = pd.DataFrame([
        {"node_name": "rs_patient_node2", "read_latency_ms": 1.5, "write_latency_ms": 3.2, "sync_lag_seconds": 2},
        {"node_name": "rs_patient_node3", "read_latency_ms": 0.0, "write_latency_ms": 0.0, "sync_lag_seconds": 9999}
    ])
    df_mongo_repl.to_excel(os.path.join(output_dir, "mongo_replica_status.xlsx"), index=False)

    # 4. OpenShift
    # OCP_POD_INFO.xlsx
    df_ocp = pd.DataFrame([
        {"cluster_name": "ocp-prod-ga", "namespace_name": "patient-portal", "pod_name": "portal-web-8df38fa-1", "deployment_name": "portal-web", "status": "RUNNING", "ip_address": "10.128.4.11", "restart_count": 0, "cpu_usage_cores": 0.25, "memory_usage_bytes": 268435456, "replicas": 3, "available_replicas": 3},
        {"cluster_name": "ocp-prod-ga", "namespace_name": "patient-portal", "pod_name": "portal-web-8df38fa-2", "deployment_name": "portal-web", "status": "CRASH_LOOP_BACK_OFF", "ip_address": "10.128.4.12", "restart_count": 14, "cpu_usage_cores": 0.0, "memory_usage_bytes": 0, "replicas": 3, "available_replicas": 2},
        {"cluster_name": "ocp-prod-ga", "namespace_name": "patient-portal", "pod_name": "portal-api-2f47a11-1", "deployment_name": "portal-api", "status": "RUNNING", "ip_address": "10.128.4.20", "restart_count": 2, "cpu_usage_cores": 0.55, "memory_usage_bytes": 536870912, "replicas": 2, "available_replicas": 2}
    ])
    df_ocp.to_excel(os.path.join(output_dir, "OCP_POD_INFO.xlsx"), index=False)

    # 5. AppDynamics
    # APPDYNAMIC_NODE_INVENTORY.xlsx
    df_appd_nodes = pd.DataFrame([
        {"application_name": "patient-portal-apm", "node_name": "jvm_portal_web_ga_1", "tier_name": "web-frontend", "status": "ACTIVE", "host": "ga-web-node1", "port": 8080},
        {"application_name": "patient-portal-apm", "node_name": "jvm_portal_api_ga_1", "tier_name": "api-service", "status": "ACTIVE", "host": "ga-api-node1", "port": 9090},
        {"application_name": "patient-portal-apm", "node_name": "jvm_portal_api_ga_2", "tier_name": "api-service", "status": "INACTIVE", "host": "ga-api-node2", "port": 9090}
    ])
    df_appd_nodes.to_excel(os.path.join(output_dir, "APPDYNAMIC_NODE_INVENTORY.xlsx"), index=False)

    # APPDYNAMIC_TRAFFIC_SAMPLES.xlsx
    df_appd_traffic = pd.DataFrame([
        {"application_name": "patient-portal-apm", "transaction_name": "getPatientDetails", "call_count": 15000, "average_response_time_ms": 145.2, "error_percentage": 0.05, "throughput_calls_per_min": 250.0},
        {"application_name": "patient-portal-apm", "transaction_name": "submitClaim", "call_count": 2500, "average_response_time_ms": 1850.0, "error_percentage": 8.4, "throughput_calls_per_min": 41.6},
        {"application_name": "patient-portal-apm", "transaction_name": "loginUser", "call_count": 22000, "average_response_time_ms": 450.0, "error_percentage": 0.12, "throughput_calls_per_min": 366.6}
    ])
    df_appd_traffic.to_excel(os.path.join(output_dir, "APPDYNAMIC_TRAFFIC_SAMPLES.xlsx"), index=False)

    # 6. Splunk Traffic
    # SPLOC_APP_TRAFFIC_SAMPLES.xlsx
    df_spl_traffic = pd.DataFrame([
        {"application_name": "patient-portal-web", "api_endpoint": "/api/v1/auth/login", "request_count": 50000, "error_count": 450, "retry_count": 1200, "avg_latency_ms": 220.5},
        {"application_name": "patient-portal-web", "api_endpoint": "/api/v1/patient/records", "request_count": 12000, "error_count": 1850, "retry_count": 3200, "avg_latency_ms": 1250.4},
        {"application_name": "patient-portal-web", "api_endpoint": "/api/v1/billing/pay", "request_count": 1500, "error_count": 5, "retry_count": 10, "avg_latency_ms": 3200.0}
    ])
    df_spl_traffic.to_excel(os.path.join(output_dir, "SPLOC_APP_TRAFFIC_SAMPLES.xlsx"), index=False)

    # load_balancer_report.xlsx
    df_lb = pd.DataFrame([
        {"load_balancer_name": "ext-alb-prod-ga", "status": "ACTIVE", "active_connections": 14200, "target_group_name": "portal-web-tg"},
        {"load_balancer_name": "int-alb-prod-ga", "status": "DEGRADED", "active_connections": 8500, "target_group_name": "portal-api-tg"},
        {"load_balancer_name": "dr-alb-shv", "status": "OFFLINE", "active_connections": 0, "target_group_name": "portal-dr-tg"}
    ])
    df_lb.to_excel(os.path.join(output_dir, "load_balancer_report.xlsx"), index=False)

    # 7. SCOM
    # SCOM_PROD_REPLICA.xlsx
    df_scom = pd.DataFrame([
        {"source_server_name": "hyperv-prod-ga-01", "target_server_name": "hyperv-dr-shv-01", "replication_status": "SYNCED", "replication_lag_seconds": 15, "dr_test_status": "PASSED", "os_type": "WINDOWS", "cpu_cores": 64, "memory_mb": 262144, "cpu_utilization_pct": 42.5, "memory_utilization_pct": 78.4, "disk_free_gb": 850.5},
        {"source_server_name": "hyperv-prod-ga-02", "target_server_name": "hyperv-dr-shv-02", "replication_status": "ERROR", "replication_lag_seconds": 7500, "dr_test_status": "FAILED", "os_type": "WINDOWS", "cpu_cores": 64, "memory_mb": 262144, "cpu_utilization_pct": 89.2, "memory_utilization_pct": 95.1, "disk_free_gb": 4.2}
    ])
    df_scom.to_excel(os.path.join(output_dir, "SCOM_PROD_REPLICA.xlsx"), index=False)

    # 8. Batch Monitor
    # batch_processing_report.xlsx
    df_batch = pd.DataFrame([
        {"job_name": "DailyClaimSettlementJob", "status": "SUCCESS", "schedule": "0 1 * * *", "start_time": "2026-05-25 01:00:00", "end_time": "2026-05-25 01:45:22", "duration_seconds": 2722, "max_duration_seconds": 3600, "error_message": ""},
        {"job_name": "PatientRecordBackupJob", "status": "FAILED", "schedule": "0 3 * * *", "start_time": "2026-05-25 03:00:00", "end_time": "2026-05-25 03:12:45", "duration_seconds": 765, "max_duration_seconds": 1800, "error_message": "Disk I/O failure on backup volume /mnt/storage-backups"},
        {"job_name": "MonthlyAuditReportJob", "status": "SUCCESS", "schedule": "0 0 1 * *", "start_time": "2026-05-01 00:00:00", "end_time": "2026-05-01 02:30:15", "duration_seconds": 9015, "max_duration_seconds": 7200, "error_message": ""}
    ])
    df_batch.to_excel(os.path.join(output_dir, "batch_processing_report.xlsx"), index=False)

    print("Successfully generated all mock sheets inside the samples directory.")

if __name__ == "__main__":
    generate_all_samples()
