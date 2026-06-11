import logging
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import event
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

logger = logging.getLogger(__name__)

connect_args = {"timeout": 30}
if settings.DATABASE_URL and "sqlite" in settings.DATABASE_URL:
    connect_args["uri"] = True

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args=connect_args
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()



class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    try:
        async with engine.begin() as conn:
            from app.models import user, lob, sub_lob, component, project, connector, health_check, audit, connector_catalog, project_connector, connector_execution_log, health_run, health_rule, chat, team, metric_template, project_connector_metric, dashboard_template, project_dashboard_assignment, aggregates, team_dashboard_assignment, lob_dashboard_assignment, rbac, user_settings, platform_integration, runtime, application_runtime, platform_proxy  # noqa: F401
            await conn.run_sync(Base.metadata.create_all)
            
            # Dynamically add component_id column to projects table if it is missing
            from sqlalchemy import text
            try:
                await conn.execute(text("ALTER TABLE projects ADD COLUMN component_id VARCHAR;"))
                logger.info("Added component_id column to projects table")
            except Exception:
                # Column probably already exists or we are creating it fresh, which is fine
                pass

            # Dynamically add sub_lob_id column to teams table if it is missing
            try:
                await conn.execute(text("ALTER TABLE teams ADD COLUMN sub_lob_id VARCHAR;"))
                logger.info("Added sub_lob_id column to teams table")
            except Exception:
                # Column probably already exists, which is fine
                pass

            # Add new audit log columns (Phase 11 persistence upgrade)
            for col_def in [
                "ALTER TABLE runtime_audit_logs ADD COLUMN asset_name VARCHAR;",
                "ALTER TABLE runtime_audit_logs ADD COLUMN before_value VARCHAR;",
                "ALTER TABLE runtime_audit_logs ADD COLUMN after_value VARCHAR;",
            ]:
                try:
                    await conn.execute(text(col_def))
                except Exception:
                    pass  # Column already exists — fine

            # Add new runtime asset columns (confidence upgrade)
            for col_def in [
                "ALTER TABLE runtime_assets ADD COLUMN confidence_label VARCHAR DEFAULT 'MEDIUM';",
                "ALTER TABLE runtime_assets ADD COLUMN confidence_score INTEGER DEFAULT 65;",
            ]:
                try:
                    await conn.execute(text(col_def))
                except Exception:
                    pass  # Column already exists — fine

            # Add new application intent columns
            for col_def in [
                "ALTER TABLE application_intents ADD COLUMN alignment_status VARCHAR DEFAULT 'UNKNOWN';",
                "ALTER TABLE application_intents ADD COLUMN project_id VARCHAR;",
            ]:
                try:
                    await conn.execute(text(col_def))
                except Exception:
                    pass  # Column already exists — fine

        logger.info("Database tables created/verified")
    except Exception as exc:
        logger.error(f"Failed to initialize database tables: {exc}")
        raise

    if settings.SEED_DB:
        await _seed_default_users()
        await _seed_connector_catalog()
    else:
        logger.info("Database seeding skipped (SEED_DB=false)")

    # await _seed_rbac_permissions()

    # Always seed runtime reference data (idempotent)
    from app.db.seed import seed_reference_data
    await seed_reference_data()


_DEFAULT_USERS = [
    {
        "email": "superadmin@livelens.ai",
        "full_name": "Super Admin",
        "password": "superadmin123",
        "role": "super_admin",
    },
    {
        "email": "admin@livelens.ai",
        "full_name": "Platform Admin",
        "password": "admin123",
        "role": "admin",
    },
    {
        "email": "lobadmin@livelens.ai",
        "full_name": "LOB Admin",
        "password": "lobadmin123",
        "role": "lob_admin",
    },
    {
        "email": "projectadmin@livelens.ai",
        "full_name": "Project Admin",
        "password": "projectadmin123",
        "role": "project_admin",
    },
    {
        "email": "analyst@livelens.ai",
        "full_name": "Data Analyst",
        "password": "analyst123",
        "role": "analyst",
    },
    {
        "email": "viewer@livelens.ai",
        "full_name": "Read-only Viewer",
        "password": "viewer123",
        "role": "viewer",
    },
    {
        "email": "user@livelens.ai",
        "full_name": "Project User",
        "password": "user123",
        "role": "project_user",
    },
]


async def _seed_default_users():
    from sqlalchemy import select
    from app.models.user import User, UserRole
    from app.core.security import get_password_hash

    logger.info("Checking database for seed users...")
    seeded = 0
    skipped = 0

    try:
        async with AsyncSessionLocal() as session:
            for entry in _DEFAULT_USERS:
                try:
                    result = await session.execute(select(User).where(User.email == entry["email"]))
                    if result.scalar_one_or_none():
                        logger.debug(f"  [skip] {entry['email']} already exists")
                        skipped += 1
                        continue

                    user = User(
                        id=str(uuid.uuid4()),
                        email=entry["email"],
                        full_name=entry["full_name"],
                        hashed_password=get_password_hash(entry["password"]),
                        role=UserRole(entry["role"]),
                        tenant_id="default",
                        is_active=True,
                    )
                    session.add(user)
                    logger.info(f"  [seed] {entry['email']} ({entry['role']})")
                    seeded += 1
                except Exception as exc:
                    logger.error(f"  [error] Failed to seed {entry['email']}: {exc}")

            await session.commit()

        if seeded:
            logger.info(f"Seeding complete: {seeded} users created, {skipped} already existed")
        else:
            logger.info(f"Seeding: all {skipped} users already exist, nothing to do")

    except Exception as exc:
        logger.error(f"Database seeding failed: {exc}")


_DEFAULT_CATALOG_CONNECTORS = [
    {
        "slug": "splunk",
        "name": "Splunk",
        "description": "Splunk Enterprise and Splunk Cloud monitoring and log aggregation platform. Connect to Splunk's REST API for health checks, index monitoring, and alert management.",
        "vendor": "Splunk Inc.",
        "category": "observability",
        "icon": "bar-chart-2",
        "color": "#FF6B35",
        "tags": "logs,observability,siem,search",
        "version": "9.x",
        "docs_url": "https://docs.splunk.com/Documentation/Splunk/latest/RESTREF",
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "Base URL", "description": "e.g. http://localhost:1016 or https://splunk.corp.example.com:8089"},
                "token": {"type": "string", "title": "API Token", "description": "Splunk authentication token", "secret": True},
                "index": {"type": "string", "title": "Default Index", "description": "Default index to query"},
                "verify_ssl": {"type": "boolean", "title": "Verify SSL", "default": False},
            },
            "required": ["base_url", "token"],
        },
        "default_config": {"base_url": "http://localhost:1016", "verify_ssl": False},
        "test_definition": {
            "method": "GET",
            "path": "/services/server/info",
            "auth_header": "Bearer {token}",
            "expected_status": [200],
            "description": "Verify Splunk server is reachable and token is valid",
        },
    },
    {
        "slug": "grafana",
        "name": "Grafana",
        "description": "Open-source analytics and monitoring platform. Connect to Grafana's HTTP API to check dashboard availability, datasource health, and alert states.",
        "vendor": "Grafana Labs",
        "category": "observability",
        "icon": "activity",
        "color": "#F46800",
        "tags": "dashboards,metrics,visualization,alerting",
        "version": "10.x",
        "docs_url": "https://grafana.com/docs/grafana/latest/developers/http_api/",
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "Base URL", "description": "e.g. http://localhost:1012 or https://grafana.corp.example.com:3000"},
                "api_key": {"type": "string", "title": "API Key", "description": "Grafana service account token", "secret": True},
                "org_id": {"type": "string", "title": "Organization ID", "default": "1"},
            },
            "required": ["base_url", "api_key"],
        },
        "default_config": {"base_url": "http://localhost:1012", "org_id": "1"},
        "test_definition": {
            "method": "GET",
            "path": "/api/health",
            "auth_header": "Bearer {api_key}",
            "expected_status": [200],
            "description": "Check Grafana health endpoint",
        },
    },
    {
        "slug": "appdynamics",
        "name": "AppDynamics",
        "description": "Full-stack application performance monitoring (APM) solution by Cisco. Monitor application performance, business transactions, and infrastructure health.",
        "vendor": "Cisco Systems",
        "category": "apm",
        "icon": "cpu",
        "color": "#00C0D1",
        "tags": "apm,performance,tracing,business-intelligence",
        "version": "23.x",
        "docs_url": "https://docs.appdynamics.com/appd/23.x/en/appdynamics-apis",
        "config_schema": {
            "type": "object",
            "properties": {
                "controller_url": {"type": "string", "title": "Controller URL", "description": "e.g. http://localhost:1005 or https://corp.saas.appdynamics.com"},
                "account_name": {"type": "string", "title": "Account Name"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "client_id": {"type": "string", "title": "Client ID"},
                "client_secret": {"type": "string", "title": "Client Secret", "secret": True},
            },
            "required": ["controller_url", "account_name"],
        },
        "default_config": {"controller_url": "http://localhost:1005"},
        "test_definition": {
            "method": "GET",
            "path": "/controller/rest/applications?output=JSON",
            "auth": "basic",
            "expected_status": [200],
            "description": "List applications to verify AppDynamics connectivity",
        },
    },
    {
        "slug": "linborg",
        "name": "Linborg",
        "description": "Enterprise integration and data orchestration platform. Connect Linborg pipelines for data flow monitoring and integration health checks.",
        "vendor": "Linborg Technologies",
        "category": "messaging",
        "icon": "git-merge",
        "color": "#5B6EF5",
        "tags": "integration,orchestration,data-pipeline,etl",
        "version": "4.x",
        "docs_url": "https://linborg.io/docs/api",
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "API Base URL"},
                "api_key": {"type": "string", "title": "API Key", "secret": True},
                "workspace_id": {"type": "string", "title": "Workspace ID"},
            },
            "required": ["base_url", "api_key"],
        },
        "default_config": {},
        "test_definition": {
            "method": "GET",
            "path": "/api/v1/status",
            "auth_header": "X-API-Key {api_key}",
            "expected_status": [200],
            "description": "Check Linborg platform status",
        },
    },
    {
        "slug": "servicenow",
        "name": "ServiceNow",
        "description": "Enterprise ITSM and workflow automation platform. Monitor incidents, change requests, and service desk metrics via the ServiceNow REST API.",
        "vendor": "ServiceNow",
        "category": "itsm",
        "icon": "clipboard-list",
        "color": "#62D84E",
        "tags": "itsm,incidents,change-management,workflow",
        "version": "Vancouver+",
        "docs_url": "https://developer.servicenow.com/dev.do#!/reference/api",
        "config_schema": {
            "type": "object",
            "properties": {
                "instance_url": {"type": "string", "title": "Instance URL", "description": "e.g. http://localhost:1015 or https://company.service-now.com"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "client_id": {"type": "string", "title": "OAuth Client ID"},
                "client_secret": {"type": "string", "title": "OAuth Client Secret", "secret": True},
            },
            "required": ["instance_url", "username", "password"],
        },
        "default_config": {"instance_url": "http://localhost:1015"},
        "test_definition": {
            "method": "GET",
            "path": "/api/now/table/sys_db_object?sysparm_limit=1",
            "auth": "basic",
            "expected_status": [200],
            "description": "Verify ServiceNow REST API connectivity",
        },
    },
    {
        "slug": "universal-rest",
        "name": "Universal REST Connector",
        "description": "Generic HTTP/REST connector for any web service. Supports custom headers, authentication methods, and flexible health check endpoint configuration.",
        "vendor": "HealthMesh",
        "category": "custom",
        "icon": "globe",
        "color": "#2563EB",
        "tags": "rest,http,generic,custom,api",
        "version": "1.0",
        "docs_url": None,
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "Base URL"},
                "health_path": {"type": "string", "title": "Health Check Path", "default": "/health"},
                "auth_type": {"type": "string", "title": "Auth Type", "enum": ["none", "bearer", "basic", "api_key"], "default": "none"},
                "token": {"type": "string", "title": "Token / API Key", "secret": True},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "custom_headers": {"type": "object", "title": "Custom Headers"},
                "timeout_seconds": {"type": "integer", "title": "Timeout (seconds)", "default": 30},
            },
            "required": ["base_url"],
        },
        "default_config": {"auth_type": "none", "health_path": "/health", "timeout_seconds": 30},
        "test_definition": {
            "method": "GET",
            "path": "{health_path}",
            "expected_status": [200, 201, 204],
            "description": "Perform HTTP GET against the configured health endpoint",
        },
    },
    {
        "slug": "universal-sql",
        "name": "Universal SQL Connector",
        "description": "Generic database connector supporting PostgreSQL, MySQL, MSSQL, and SQLite. Executes configurable health check queries to verify database availability.",
        "vendor": "HealthMesh",
        "category": "database",
        "icon": "database",
        "color": "#059669",
        "tags": "database,sql,postgres,mysql,mssql",
        "version": "1.0",
        "docs_url": None,
        "config_schema": {
            "type": "object",
            "properties": {
                "db_type": {"type": "string", "title": "Database Type", "enum": ["postgresql", "mysql", "mssql", "sqlite"], "default": "postgresql"},
                "host": {"type": "string", "title": "Host"},
                "port": {"type": "integer", "title": "Port"},
                "database": {"type": "string", "title": "Database Name"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "ssl_mode": {"type": "string", "title": "SSL Mode", "enum": ["disable", "require", "verify-full"], "default": "require"},
                "health_query": {"type": "string", "title": "Health Check Query", "default": "SELECT 1"},
            },
            "required": ["host", "database", "username"],
        },
        "default_config": {"db_type": "postgresql", "port": 5432, "ssl_mode": "require", "health_query": "SELECT 1"},
        "test_definition": {
            "type": "sql",
            "query": "{health_query}",
            "expected_result": "non-empty",
            "description": "Execute health query to verify database connectivity",
        },
    },
    {
        "slug": "prometheus",
        "name": "Prometheus",
        "description": "Enterprise Prometheus monitoring and alerting platform. Connects to custom scrapers, alerts manager, and host metrics exporters.",
        "vendor": "CNCF / Prometheus",
        "category": "observability",
        "icon": "activity",
        "color": "#E6522C",
        "tags": "metrics,observability,alerts,scraping",
        "version": "2.x",
        "docs_url": "https://prometheus.io/docs/prometheus/latest/querying/api/",
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "Base URL", "description": "e.g. http://localhost:1011 (connector service) or http://prometheus:9090 (native)"}
            },
            "required": ["base_url"]
        },
        "default_config": {"base_url": "http://localhost:1011"},
        "test_definition": {
            "method": "GET",
            "path": "/api/v1/status/runtimeinfo",
            "expected_status": [200],
            "description": "Verify Prometheus API connectivity"
        }
    },
    {
        "slug": "pcf",
        "name": "PCF Cloud",
        "description": "Pivotal Cloud Foundry (PCF) Diego Cell and container resource allocation telemetry connector.",
        "vendor": "VMware / Tanzu",
        "category": "cloud",
        "icon": "cloud",
        "color": "#00A2E2",
        "tags": "cloud,containers,diego,paas",
        "version": "3.x",
        "docs_url": "https://docs.vmware.com/en/VMware-Tanzu-Application-Service/index.html",
        "config_schema": {
            "type": "object",
            "properties": {
                "api_url": {"type": "string", "title": "API URL", "description": "e.g. http://localhost:1013 or https://api.pcf.example.com"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True}
            },
            "required": ["api_url", "username", "password"]
        },
        "default_config": {"api_url": "http://localhost:1013"},
        "test_definition": {
            "method": "GET",
            "path": "/v3/info",
            "expected_status": [200],
            "description": "Verify PCF cloud controller connectivity"
        }
    },
    {
        "slug": "vm",
        "name": "VM vCenter",
        "description": "VMware vCenter hypervisor and ESXi cluster resource management status connector.",
        "vendor": "VMware",
        "category": "infrastructure",
        "icon": "hard-drive",
        "color": "#126782",
        "tags": "virtualization,infrastructure,vcenter,esxi",
        "version": "8.x",
        "docs_url": "https://developer.vmware.com/apis/vsphere-automation/",
        "config_schema": {
            "type": "object",
            "properties": {
                "vcenter_url": {"type": "string", "title": "vCenter URL", "description": "e.g. http://localhost:1014 or https://vcenter.example.com"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True}
            },
            "required": ["vcenter_url", "username", "password"]
        },
        "default_config": {"vcenter_url": "http://localhost:1014"},
        "test_definition": {
            "method": "GET",
            "path": "/api/vcenter/deployment",
            "expected_status": [200],
            "description": "Verify VMware vCenter connectivity"
        }
    },
    {
        "slug": "scom",
        "name": "Microsoft SCOM",
        "description": "System Center Operations Manager (SCOM) for Windows Server and distributed application monitoring. Queries management packs, alert states, and health monitors via the SCOM REST API.",
        "vendor": "Microsoft",
        "category": "observability",
        "icon": "monitor",
        "color": "#00A4EF",
        "tags": "monitoring,windows,infrastructure,alerts,management-packs",
        "version": "2022",
        "docs_url": "https://learn.microsoft.com/en-us/system-center/scom/manage-api",
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "SCOM Web Console URL", "description": "e.g. https://scom.corp.example.com:7443"},
                "username": {"type": "string", "title": "Domain\\Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "verify_ssl": {"type": "boolean", "title": "Verify SSL", "default": False}
            },
            "required": ["base_url", "username", "password"]
        },
        "default_config": {"base_url": "http://localhost:1007", "verify_ssl": False},
        "test_definition": {
            "method": "GET",
            "path": "/OperationsManager/data/alert",
            "auth": "ntlm",
            "expected_status": [200],
            "description": "Query SCOM alerts to verify connectivity"
        }
    },
    {
        "slug": "oracle-oem",
        "name": "Oracle OEM",
        "description": "Oracle Enterprise Manager for Oracle Database monitoring. Tracks Data Guard replication roles, tablespace utilization, Active Session History, and alert logs via OEM REST API.",
        "vendor": "Oracle Corporation",
        "category": "database",
        "icon": "database",
        "color": "#F80000",
        "tags": "database,oracle,dataguard,replication,apm",
        "version": "13c",
        "docs_url": "https://docs.oracle.com/en/enterprise-manager/cloud-control/enterprise-manager-cloud-control/13.5/emcli/",
        "config_schema": {
            "type": "object",
            "properties": {
                "oem_url": {"type": "string", "title": "OEM Console URL", "description": "e.g. https://oem.corp.example.com:7803/em"},
                "username": {"type": "string", "title": "SYSMAN Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "verify_ssl": {"type": "boolean", "title": "Verify SSL", "default": True}
            },
            "required": ["oem_url", "username", "password"]
        },
        "default_config": {"oem_url": "http://localhost:1002", "verify_ssl": False},
        "test_definition": {
            "method": "GET",
            "path": "/api/emcli/v1/hosts",
            "auth": "basic",
            "expected_status": [200],
            "description": "List managed hosts to verify OEM connectivity"
        }
    },
    {
        "slug": "ibm-mq",
        "name": "IBM MQ",
        "description": "IBM MQ Queue Manager monitoring for enterprise message queuing. Tracks queue depths, channel states, cluster membership, and dead-letter queue backlogs via the MQ REST API.",
        "vendor": "IBM",
        "category": "messaging",
        "icon": "mail",
        "color": "#054ADA",
        "tags": "messaging,queues,mq,ibm,channels,clustering",
        "version": "9.3",
        "docs_url": "https://www.ibm.com/docs/en/ibm-mq/9.3?topic=api-rest",
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "MQ Console URL", "description": "e.g. https://mq.corp.example.com:9443"},
                "qmgr_name": {"type": "string", "title": "Queue Manager Name", "description": "e.g. QM4UPRDGA01"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "verify_ssl": {"type": "boolean", "title": "Verify SSL", "default": True}
            },
            "required": ["base_url", "qmgr_name", "username", "password"]
        },
        "default_config": {"base_url": "http://localhost:1001", "qmgr_name": "QM4UPRDGA01", "verify_ssl": False},
        "test_definition": {
            "method": "GET",
            "path": "/ibmmq/rest/v2/admin/qmgr/{qmgr_name}",
            "auth": "basic",
            "expected_status": [200],
            "description": "Query Queue Manager status to verify MQ connectivity"
        }
    },
    {
        "slug": "kafka",
        "name": "Apache Kafka",
        "description": "Apache Kafka distributed event streaming platform. Monitors broker health, controller election, under-replicated partitions, consumer group lag, and topic throughput via JMX or Confluent REST Proxy.",
        "vendor": "Apache / Confluent",
        "category": "messaging",
        "icon": "radio",
        "color": "#231F20",
        "tags": "streaming,events,kafka,brokers,consumers,topics",
        "version": "3.x",
        "docs_url": "https://kafka.apache.org/documentation/",
        "config_schema": {
            "type": "object",
            "properties": {
                "bootstrap_servers": {"type": "string", "title": "Bootstrap Servers", "description": "e.g. kafka-01.corp.example.com:9092,kafka-02.corp.example.com:9092"},
                "rest_proxy_url": {"type": "string", "title": "REST Proxy URL", "description": "e.g. http://kafka-rest.corp.example.com:8082"},
                "schema_registry_url": {"type": "string", "title": "Schema Registry URL"},
                "sasl_mechanism": {"type": "string", "title": "SASL Mechanism", "enum": ["PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512", "GSSAPI"], "default": "PLAIN"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True}
            },
            "required": ["bootstrap_servers"]
        },
        "default_config": {"bootstrap_servers": "kafka-01.corp.example.com:9092", "sasl_mechanism": "PLAIN"},
        "test_definition": {
            "method": "GET",
            "path": "/v3/clusters",
            "expected_status": [200],
            "description": "List Kafka clusters via REST Proxy to verify connectivity"
        }
    },
    {
        "slug": "mongodb",
        "name": "MongoDB",
        "description": "MongoDB NoSQL database cluster monitoring. Tracks replica set membership, primary/secondary election state, oplog window, connection pools, and WiredTiger cache utilization.",
        "vendor": "MongoDB Inc.",
        "category": "database",
        "icon": "database",
        "color": "#00ED64",
        "tags": "nosql,database,replication,sharding,mongodb",
        "version": "7.x",
        "docs_url": "https://www.mongodb.com/docs/manual/reference/command/",
        "config_schema": {
            "type": "object",
            "properties": {
                "connection_string": {"type": "string", "title": "Connection URI", "description": "e.g. mongodb://mongo-01.corp.example.com:27017,mongo-02.corp.example.com:27017/admin?replicaSet=rs0"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "auth_db": {"type": "string", "title": "Auth Database", "default": "admin"},
                "tls": {"type": "boolean", "title": "Enable TLS", "default": True}
            },
            "required": ["connection_string"]
        },
        "default_config": {"connection_string": "http://localhost:1003", "auth_db": "admin", "tls": False},
        "test_definition": {
            "type": "mongodb",
            "command": "db.runCommand({replSetGetStatus: 1})",
            "expected_result": "ok=1",
            "description": "Check replica set status to verify MongoDB connectivity"
        }
    },
    {
        "slug": "openshift",
        "name": "Red Hat OpenShift",
        "description": "OpenShift Container Platform (OCP) monitoring. Tracks pod health, deployment rollouts, node resource utilization, route ingress, and cluster operator status via the Kubernetes/OCP REST API.",
        "vendor": "Red Hat / IBM",
        "category": "cloud",
        "icon": "container",
        "color": "#EE0000",
        "tags": "kubernetes,containers,openshift,pods,deployments,cloud-native",
        "version": "4.x",
        "docs_url": "https://docs.openshift.com/container-platform/latest/rest_api/index.html",
        "config_schema": {
            "type": "object",
            "properties": {
                "api_url": {"type": "string", "title": "OCP API Server URL", "description": "e.g. https://api.ocp-cluster.corp.example.com:6443"},
                "token": {"type": "string", "title": "Service Account Token", "secret": True},
                "namespace": {"type": "string", "title": "Default Namespace", "description": "e.g. production"},
                "verify_ssl": {"type": "boolean", "title": "Verify SSL", "default": True}
            },
            "required": ["api_url", "token"]
        },
        "default_config": {"api_url": "http://localhost:1004", "namespace": "production", "verify_ssl": False},
        "test_definition": {
            "method": "GET",
            "path": "/apis",
            "auth_header": "Bearer {token}",
            "expected_status": [200],
            "description": "List API groups to verify OpenShift connectivity"
        }
    },
    {
        "slug": "autosys",
        "name": "Autosys Workload Automation",
        "description": "Broadcom Autosys Workload Automation for enterprise batch job scheduling. Monitors job statuses, agent health, calendar schedules, and cross-dependency chains via the WLAM REST API.",
        "vendor": "Broadcom",
        "category": "observability",
        "icon": "clock",
        "color": "#CC0000",
        "tags": "batch,scheduling,jobs,autosys,automation,workload",
        "version": "12.x",
        "docs_url": "https://techdocs.broadcom.com/us/en/ca-enterprise-software/intelligent-automation/autosys-workload-automation/12-0.html",
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "WLAM REST URL", "description": "e.g. https://autosys.corp.example.com:9443/AEWS"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "instance": {"type": "string", "title": "Instance Name", "default": "ACE"}
            },
            "required": ["base_url", "username", "password"]
        },
        "default_config": {"base_url": "https://autosys.corp.example.com:9443/AEWS", "instance": "ACE"},
        "test_definition": {
            "method": "GET",
            "path": "/rest/scheduler/status",
            "auth": "basic",
            "expected_status": [200],
            "description": "Check Autosys scheduler daemon status"
        }
    },
    {
        "slug": "adc-loadbalancer",
        "name": "ADC Load Balancer (NSX ALB)",
        "description": "VMware NSX Advanced Load Balancer (formerly AVI Networks). Monitors virtual service health, pool server status, SSL certificate expiry, WAF events, and real-time analytics via the AVI Controller REST API.",
        "vendor": "VMware / Broadcom",
        "category": "infrastructure",
        "icon": "network",
        "color": "#78BE20",
        "tags": "load-balancer,networking,ssl,waf,traffic-management,vip",
        "version": "22.x",
        "docs_url": "https://avinetworks.com/docs/latest/api-guide/",
        "config_schema": {
            "type": "object",
            "properties": {
                "controller_url": {"type": "string", "title": "AVI Controller URL", "description": "e.g. https://avi-ctrl.corp.example.com"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "tenant": {"type": "string", "title": "Tenant", "default": "admin"},
                "api_version": {"type": "string", "title": "API Version", "default": "22.1.1"}
            },
            "required": ["controller_url", "username", "password"]
        },
        "default_config": {"controller_url": "http://localhost:1009", "tenant": "admin", "api_version": "22.1.1"},
        "test_definition": {
            "method": "GET",
            "path": "/api/cluster/runtime",
            "auth": "session",
            "expected_status": [200],
            "description": "Check AVI controller cluster runtime status"
        }
    },
    {
        "slug": "mssql",
        "name": "Microsoft SQL Server",
        "description": "MS SQL Server AlwaysOn Availability Group monitoring. Tracks AG replica states, synchronization health, failover readiness, database mirroring endpoints, and DMV performance counters.",
        "vendor": "Microsoft",
        "category": "database",
        "icon": "database",
        "color": "#CC2927",
        "tags": "database,mssql,alwayson,availability-groups,replication",
        "version": "2022",
        "docs_url": "https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/",
        "config_schema": {
            "type": "object",
            "properties": {
                "host": {"type": "string", "title": "SQL Server Host", "description": "e.g. sqlserver-01.corp.example.com"},
                "port": {"type": "integer", "title": "Port", "default": 1433},
                "database": {"type": "string", "title": "Database", "default": "master"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "encrypt": {"type": "boolean", "title": "Encrypt Connection", "default": True},
                "trust_server_certificate": {"type": "boolean", "title": "Trust Server Certificate", "default": False}
            },
            "required": ["host", "username", "password"]
        },
        "default_config": {"host": "sqlserver-01.corp.example.com", "port": 1433, "database": "master", "encrypt": True},
        "test_definition": {
            "type": "sql",
            "query": "SELECT @@SERVERNAME AS ServerName, @@VERSION AS Version",
            "expected_result": "non-empty",
            "description": "Verify SQL Server connectivity and version"
        }
    },
    {
        "slug": "splunk-traffic",
        "name": "Splunk Traffic Analytics",
        "description": "Splunk-based application traffic monitoring connector. Tracks request rates, latency percentiles, error rates, and throughput trends by parsing Splunk SPL queries against traffic log indexes.",
        "vendor": "Splunk Inc.",
        "category": "observability",
        "icon": "bar-chart-2",
        "color": "#FF6B35",
        "tags": "logs,traffic,latency,error-rate,throughput,spl",
        "version": "9.x",
        "docs_url": "https://docs.splunk.com/Documentation/Splunk/latest/RESTREF",
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "Splunk Base URL", "description": "e.g. http://localhost:1006 or https://splunk.corp.example.com:8089"},
                "token": {"type": "string", "title": "API Token", "description": "Splunk authentication token", "secret": True},
                "traffic_index": {"type": "string", "title": "Traffic Log Index", "description": "Splunk index containing traffic logs", "default": "main"},
                "app_filter": {"type": "string", "title": "Application Filter", "description": "SPL filter to scope traffic queries by application"},
                "verify_ssl": {"type": "boolean", "title": "Verify SSL", "default": False},
            },
            "required": ["base_url", "token"],
        },
        "default_config": {"base_url": "http://localhost:1006", "traffic_index": "main", "verify_ssl": False},
        "test_definition": {
            "method": "GET",
            "path": "/health",
            "expected_status": [200],
            "description": "Check Splunk Traffic connector health endpoint",
        },
    },
    {
        "slug": "batch-monitor",
        "name": "Batch Job Monitor",
        "description": "Enterprise batch job and workload automation monitoring connector. Tracks job execution status, SLA compliance, runtime durations, failure rates, and dependency chain health across batch scheduling platforms.",
        "vendor": "HealthMesh",
        "category": "observability",
        "icon": "clock",
        "color": "#8B5CF6",
        "tags": "batch,scheduling,jobs,sla,automation,workload",
        "version": "1.0",
        "docs_url": None,
        "config_schema": {
            "type": "object",
            "properties": {
                "base_url": {"type": "string", "title": "Connector Service URL", "description": "e.g. http://localhost:1008"},
                "scheduler_type": {"type": "string", "title": "Scheduler Type", "enum": ["autosys", "controlm", "tivoli", "custom"], "default": "autosys"},
                "api_endpoint": {"type": "string", "title": "Scheduler API Endpoint", "description": "Base URL of the scheduling platform REST API"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "secret": True},
                "job_filter": {"type": "string", "title": "Job Name Filter", "description": "Glob pattern to filter jobs (e.g. PROD_*)"},
            },
            "required": ["base_url"],
        },
        "default_config": {"base_url": "http://localhost:1008", "scheduler_type": "autosys"},
        "test_definition": {
            "method": "GET",
            "path": "/health",
            "expected_status": [200],
            "description": "Check Batch Monitor connector health endpoint",
        },
    },
]


async def _seed_connector_catalog():
    from sqlalchemy import select
    from app.models.connector_catalog import ConnectorCatalogEntry, CatalogConnectorCategory, CatalogConnectorStatus

    logger.info("Checking connector catalog for seed entries...")
    seeded = 0
    skipped = 0

    try:
        async with AsyncSessionLocal() as session:
            for entry_data in _DEFAULT_CATALOG_CONNECTORS:
                try:
                    result = await session.execute(
                        select(ConnectorCatalogEntry).where(ConnectorCatalogEntry.slug == entry_data["slug"])
                    )
                    if result.scalar_one_or_none():
                        skipped += 1
                        continue

                    entry = ConnectorCatalogEntry(
                        id=str(uuid.uuid4()),
                        slug=entry_data["slug"],
                        name=entry_data["name"],
                        description=entry_data["description"],
                        vendor=entry_data["vendor"],
                        category=CatalogConnectorCategory(entry_data["category"]),
                        status=CatalogConnectorStatus.ACTIVE,
                        icon=entry_data["icon"],
                        color=entry_data["color"],
                        tags=entry_data["tags"],
                        is_system=True,
                        is_enabled=True,
                        config_schema=entry_data.get("config_schema"),
                        default_config=entry_data.get("default_config"),
                        test_definition=entry_data.get("test_definition"),
                        docs_url=entry_data.get("docs_url"),
                        version=entry_data.get("version"),
                        created_by=None,
                    )
                    session.add(entry)
                    logger.info(f"  [seed] connector catalog: {entry_data['name']}")
                    seeded += 1
                except Exception as exc:
                    logger.error(f"  [error] Failed to seed catalog entry {entry_data['name']}: {exc}")

            await session.commit()

        if seeded:
            logger.info(f"Connector catalog seeding complete: {seeded} entries created, {skipped} already existed")
        else:
            logger.info(f"Connector catalog: all {skipped} entries already exist")

    except Exception as exc:
        logger.error(f"Connector catalog seeding failed: {exc}")

    await _seed_metric_templates()


_DEFAULT_METRIC_TEMPLATES = {
    "splunk": [
        {
            "name": "Total Log Volume",
            "metric_key": "total_log_volume",
            "description": "Total number of log events ingested in the time window",
            "category": "logs",
            "display_order": 1,
            "metric_type": "number",
            "unit": "events",
            "aggregation_type": "sum",
            "threshold_warning": 1000000,
            "threshold_critical": 5000000,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Error Count",
            "metric_key": "error_count",
            "description": "Total number of error-level log events",
            "category": "logs",
            "display_order": 2,
            "metric_type": "number",
            "unit": "errors",
            "aggregation_type": "sum",
            "threshold_warning": 100,
            "threshold_critical": 500,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* level=ERROR | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Warning Count",
            "metric_key": "warning_count",
            "description": "Total number of warning-level log events",
            "category": "logs",
            "display_order": 3,
            "metric_type": "number",
            "unit": "warnings",
            "aggregation_type": "sum",
            "threshold_warning": 500,
            "threshold_critical": 2000,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* level=WARN | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Critical Error Count",
            "metric_key": "critical_error_count",
            "description": "Total number of critical severity log events",
            "category": "logs",
            "display_order": 4,
            "metric_type": "number",
            "unit": "events",
            "aggregation_type": "sum",
            "threshold_warning": 1,
            "threshold_critical": 10,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* level=CRITICAL | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Exception Count",
            "metric_key": "exception_count",
            "description": "Total number of logged exceptions or stack traces",
            "category": "logs",
            "display_order": 5,
            "metric_type": "number",
            "unit": "exceptions",
            "aggregation_type": "sum",
            "threshold_warning": 50,
            "threshold_critical": 200,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* (Exception OR Traceback OR \"stack trace\") | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Unique Error Types",
            "metric_key": "unique_error_types",
            "description": "Count of distinct error message signatures",
            "category": "logs",
            "display_order": 6,
            "metric_type": "number",
            "unit": "types",
            "aggregation_type": "count",
            "threshold_warning": 10,
            "threshold_critical": 50,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* level=ERROR | dedup message | stats count",
                "time_range": "-1h",
                "aggregation": "count",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Failed Transactions",
            "metric_key": "failed_transactions",
            "description": "Count of transactions that ended in a failure state",
            "category": "logs",
            "display_order": 7,
            "metric_type": "number",
            "unit": "transactions",
            "aggregation_type": "sum",
            "threshold_warning": 20,
            "threshold_critical": 100,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* status=failed OR status=error | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Success Transactions",
            "metric_key": "success_transactions",
            "description": "Count of transactions that completed successfully",
            "category": "logs",
            "display_order": 8,
            "metric_type": "number",
            "unit": "transactions",
            "aggregation_type": "sum",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* status=success OR status=200 | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Average Response Time",
            "metric_key": "avg_response_time",
            "description": "Mean response time across all measured requests",
            "category": "performance",
            "display_order": 9,
            "metric_type": "duration",
            "unit": "ms",
            "aggregation_type": "avg",
            "threshold_warning": 500,
            "threshold_critical": 2000,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* response_time=* | stats avg(response_time) as avg_rt",
                "time_range": "-1h",
                "aggregation": "avg",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].avg_rt"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "P95 Response Time",
            "metric_key": "p95_response_time",
            "description": "95th percentile response time",
            "category": "performance",
            "display_order": 10,
            "metric_type": "duration",
            "unit": "ms",
            "aggregation_type": "max",
            "threshold_warning": 1000,
            "threshold_critical": 3000,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* response_time=* | stats perc95(response_time) as p95",
                "time_range": "-1h",
                "aggregation": "max",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].p95"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "P99 Response Time",
            "metric_key": "p99_response_time",
            "description": "99th percentile response time",
            "category": "performance",
            "display_order": 11,
            "metric_type": "duration",
            "unit": "ms",
            "aggregation_type": "max",
            "threshold_warning": 2000,
            "threshold_critical": 5000,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* response_time=* | stats perc99(response_time) as p99",
                "time_range": "-1h",
                "aggregation": "max",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].p99"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Throughput",
            "metric_key": "throughput",
            "description": "Number of requests processed per second",
            "category": "performance",
            "display_order": 12,
            "metric_type": "number",
            "unit": "req/s",
            "aggregation_type": "avg",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* | bin _time span=1s | stats count by _time | stats avg(count) as throughput",
                "time_range": "-5m",
                "aggregation": "avg",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].throughput"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Request Rate",
            "metric_key": "request_rate",
            "description": "Total requests per minute across all services",
            "category": "performance",
            "display_order": 13,
            "metric_type": "number",
            "unit": "req/min",
            "aggregation_type": "sum",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* | bin _time span=1m | stats count by _time | stats avg(count) as rpm",
                "time_range": "-15m",
                "aggregation": "avg",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].rpm"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Failed Login Attempts",
            "metric_key": "failed_login_attempts",
            "description": "Number of authentication failures detected in logs",
            "category": "security",
            "display_order": 14,
            "metric_type": "number",
            "unit": "attempts",
            "aggregation_type": "sum",
            "threshold_warning": 10,
            "threshold_critical": 50,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* (\"authentication failure\" OR \"login failed\" OR \"invalid credentials\") | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Suspicious Activity Count",
            "metric_key": "suspicious_activity_count",
            "description": "Count of events flagged as suspicious or anomalous",
            "category": "security",
            "display_order": 15,
            "metric_type": "number",
            "unit": "events",
            "aggregation_type": "sum",
            "threshold_warning": 5,
            "threshold_critical": 25,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* (suspicious OR anomaly OR \"brute force\" OR \"port scan\") | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Auth Failures",
            "metric_key": "auth_failures",
            "description": "Total authorization and permission denial events",
            "category": "security",
            "display_order": 16,
            "metric_type": "number",
            "unit": "failures",
            "aggregation_type": "sum",
            "threshold_warning": 20,
            "threshold_critical": 100,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* (\"permission denied\" OR \"unauthorized\" OR \"403\" OR \"401\") | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Host Availability",
            "metric_key": "host_availability",
            "description": "Percentage of hosts reporting as available",
            "category": "infrastructure",
            "display_order": 17,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "avg",
            "threshold_warning": 95,
            "threshold_critical": 90,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* sourcetype=ping | stats dc(host) as available_hosts",
                "time_range": "-5m",
                "aggregation": "avg",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].available_hosts"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Service Restarts",
            "metric_key": "service_restarts",
            "description": "Count of service restart events across all monitored hosts",
            "category": "infrastructure",
            "display_order": 18,
            "metric_type": "number",
            "unit": "restarts",
            "aggregation_type": "sum",
            "threshold_warning": 3,
            "threshold_critical": 10,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* (\"service restart\" OR \"process restart\" OR \"systemd restart\") | stats count",
                "time_range": "-1h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Deployment Events",
            "metric_key": "deployment_events",
            "description": "Number of deployment or release events logged",
            "category": "infrastructure",
            "display_order": 19,
            "metric_type": "number",
            "unit": "events",
            "aggregation_type": "sum",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "POST",
                "path": "/services/search/jobs",
                "search": "search index=* (\"deploy\" OR \"release\" OR \"rollout\" OR \"promote\") | stats count",
                "time_range": "-24h",
                "aggregation": "sum",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.results[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
    ],
    "grafana": [
        {
            "name": "CPU Usage",
            "metric_key": "cpu_usage",
            "description": "Average CPU utilization percentage across all monitored hosts",
            "category": "infrastructure",
            "display_order": 1,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "avg",
            "threshold_warning": 75,
            "threshold_critical": 90,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "100 - (avg by (instance) (rate(node_cpu_seconds_total{mode='idle'}[5m])) * 100)",
                "panel_selector": "cpu-overview",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Memory Usage",
            "metric_key": "memory_usage",
            "description": "Average memory utilization percentage across all monitored hosts",
            "category": "infrastructure",
            "display_order": 2,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "avg",
            "threshold_warning": 80,
            "threshold_critical": 95,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
                "panel_selector": "memory-overview",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Disk Usage",
            "metric_key": "disk_usage",
            "description": "Disk space utilization percentage",
            "category": "infrastructure",
            "display_order": 3,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "max",
            "threshold_warning": 80,
            "threshold_critical": 95,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100",
                "panel_selector": "disk-overview",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Disk IOPS",
            "metric_key": "disk_iops",
            "description": "I/O operations per second on primary storage",
            "category": "infrastructure",
            "display_order": 4,
            "metric_type": "number",
            "unit": "ops/s",
            "aggregation_type": "avg",
            "threshold_warning": 5000,
            "threshold_critical": 10000,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "rate(node_disk_io_time_seconds_total[5m])",
                "panel_selector": "disk-iops",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Network In",
            "metric_key": "network_in",
            "description": "Inbound network throughput in bytes per second",
            "category": "infrastructure",
            "display_order": 5,
            "metric_type": "number",
            "unit": "bytes/s",
            "aggregation_type": "sum",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "rate(node_network_receive_bytes_total[5m])",
                "panel_selector": "network-overview",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Network Out",
            "metric_key": "network_out",
            "description": "Outbound network throughput in bytes per second",
            "category": "infrastructure",
            "display_order": 6,
            "metric_type": "number",
            "unit": "bytes/s",
            "aggregation_type": "sum",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "rate(node_network_transmit_bytes_total[5m])",
                "panel_selector": "network-overview",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Pod Count",
            "metric_key": "pod_count",
            "description": "Number of running Kubernetes pods",
            "category": "infrastructure",
            "display_order": 7,
            "metric_type": "number",
            "unit": "pods",
            "aggregation_type": "sum",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "count(kube_pod_info{phase='Running'})",
                "panel_selector": "k8s-pods",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Container Restarts",
            "metric_key": "container_restarts",
            "description": "Total container restart count across all pods",
            "category": "infrastructure",
            "display_order": 8,
            "metric_type": "number",
            "unit": "restarts",
            "aggregation_type": "sum",
            "threshold_warning": 5,
            "threshold_critical": 20,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "sum(increase(kube_pod_container_status_restarts_total[1h]))",
                "panel_selector": "k8s-pods",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Request Rate",
            "metric_key": "request_rate",
            "description": "HTTP request rate across all services",
            "category": "application",
            "display_order": 9,
            "metric_type": "number",
            "unit": "req/s",
            "aggregation_type": "sum",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "sum(rate(http_requests_total[5m]))",
                "panel_selector": "app-request-rate",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Error Rate",
            "metric_key": "error_rate",
            "description": "Percentage of HTTP requests returning 5xx status codes",
            "category": "application",
            "display_order": 10,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "avg",
            "threshold_warning": 1,
            "threshold_critical": 5,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "sum(rate(http_requests_total{status=~'5..'}[5m])) / sum(rate(http_requests_total[5m])) * 100",
                "panel_selector": "app-error-rate",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Latency",
            "metric_key": "latency",
            "description": "P50 request latency in milliseconds",
            "category": "application",
            "display_order": 11,
            "metric_type": "duration",
            "unit": "ms",
            "aggregation_type": "avg",
            "threshold_warning": 200,
            "threshold_critical": 1000,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "histogram_quantile(0.5, sum(rate(http_request_duration_ms_bucket[5m])) by (le))",
                "panel_selector": "app-latency",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Saturation",
            "metric_key": "saturation",
            "description": "Service queue depth or pending request backlog",
            "category": "application",
            "display_order": 12,
            "metric_type": "number",
            "unit": "requests",
            "aggregation_type": "max",
            "threshold_warning": 50,
            "threshold_critical": 200,
            "query_config": {
                "method": "GET",
                "path": "/api/datasources/proxy/1/api/v1/query",
                "datasource": "prometheus",
                "query_path": "sum(http_requests_in_flight)",
                "panel_selector": "app-saturation",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.result[0].value[1]"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
    ],
    "appdynamics": [
        {
            "name": "App Response Time",
            "metric_key": "app_response_time",
            "description": "Average application response time in milliseconds",
            "category": "apm",
            "display_order": 1,
            "metric_type": "duration",
            "unit": "ms",
            "aggregation_type": "avg",
            "threshold_warning": 500,
            "threshold_critical": 2000,
            "query_config": {
                "method": "GET",
                "path": "/controller/rest/applications/{application}/metric-data",
                "metric_path": "Overall Application Performance|Average Response Time (ms)",
                "entity_selector": "APPLICATION",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$[0].metricValues[0].value"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Apdex Score",
            "metric_key": "apdex_score",
            "description": "Application Performance Index score (0-100)",
            "category": "apm",
            "display_order": 2,
            "metric_type": "number",
            "unit": "score",
            "aggregation_type": "avg",
            "threshold_warning": 70,
            "threshold_critical": 50,
            "query_config": {
                "method": "GET",
                "path": "/controller/rest/applications/{application}/metric-data",
                "metric_path": "Overall Application Performance|User Experience|Apdex",
                "entity_selector": "APPLICATION",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$[0].metricValues[0].value"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Business Transaction Volume",
            "metric_key": "bt_volume",
            "description": "Number of business transactions executed per minute",
            "category": "apm",
            "display_order": 3,
            "metric_type": "number",
            "unit": "calls/min",
            "aggregation_type": "sum",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "GET",
                "path": "/controller/rest/applications/{application}/metric-data",
                "metric_path": "Overall Application Performance|Calls per Minute",
                "entity_selector": "APPLICATION",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$[0].metricValues[0].value"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Error Rate",
            "metric_key": "error_rate",
            "description": "Percentage of business transactions with errors",
            "category": "apm",
            "display_order": 4,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "avg",
            "threshold_warning": 1,
            "threshold_critical": 5,
            "query_config": {
                "method": "GET",
                "path": "/controller/rest/applications/{application}/metric-data",
                "metric_path": "Overall Application Performance|% Errors",
                "entity_selector": "APPLICATION",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$[0].metricValues[0].value"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Slow Transaction Count",
            "metric_key": "slow_transaction_count",
            "description": "Number of slow transactions exceeding the configured threshold",
            "category": "apm",
            "display_order": 5,
            "metric_type": "number",
            "unit": "transactions",
            "aggregation_type": "sum",
            "threshold_warning": 10,
            "threshold_critical": 50,
            "query_config": {
                "method": "GET",
                "path": "/controller/rest/applications/{application}/metric-data",
                "metric_path": "Overall Application Performance|Slow Calls per Minute",
                "entity_selector": "APPLICATION",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$[0].metricValues[0].value"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "JVM Heap Usage",
            "metric_key": "jvm_heap_usage",
            "description": "JVM heap memory utilization percentage",
            "category": "apm",
            "display_order": 6,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "avg",
            "threshold_warning": 75,
            "threshold_critical": 90,
            "query_config": {
                "method": "GET",
                "path": "/controller/rest/applications/{application}/metric-data",
                "metric_path": "JVM|Memory:Heap|Used (MB)",
                "entity_selector": "APPLICATION_COMPONENT_NODE",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$[0].metricValues[0].value"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Thread Count",
            "metric_key": "thread_count",
            "description": "Active thread count in the JVM",
            "category": "apm",
            "display_order": 7,
            "metric_type": "number",
            "unit": "threads",
            "aggregation_type": "avg",
            "threshold_warning": 200,
            "threshold_critical": 500,
            "query_config": {
                "method": "GET",
                "path": "/controller/rest/applications/{application}/metric-data",
                "metric_path": "JVM|Threads|Current No. of Threads",
                "entity_selector": "APPLICATION_COMPONENT_NODE",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$[0].metricValues[0].value"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "GC Time",
            "metric_key": "gc_time",
            "description": "Time spent in garbage collection per minute",
            "category": "apm",
            "display_order": 8,
            "metric_type": "duration",
            "unit": "ms/min",
            "aggregation_type": "avg",
            "threshold_warning": 1000,
            "threshold_critical": 5000,
            "query_config": {
                "method": "GET",
                "path": "/controller/rest/applications/{application}/metric-data",
                "metric_path": "JVM|Garbage Collection|GC Time Spent Per Min (ms)",
                "entity_selector": "APPLICATION_COMPONENT_NODE",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$[0].metricValues[0].value"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
    ],
    "servicenow": [
        {
            "name": "Open Incidents",
            "metric_key": "open_incidents",
            "description": "Total number of currently open incidents",
            "category": "incident",
            "display_order": 1,
            "metric_type": "number",
            "unit": "incidents",
            "aggregation_type": "count",
            "threshold_warning": 50,
            "threshold_critical": 200,
            "query_config": {
                "method": "GET",
                "path": "/api/now/table/incident",
                "table_selector": "incident",
                "filter_query": "state=1^ORstate=2^ORstate=3",
                "sysparm_count": True,
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.result[0].count"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Critical Incidents",
            "metric_key": "critical_incidents",
            "description": "Count of open P1/critical severity incidents",
            "category": "incident",
            "display_order": 2,
            "metric_type": "number",
            "unit": "incidents",
            "aggregation_type": "count",
            "threshold_warning": 1,
            "threshold_critical": 5,
            "query_config": {
                "method": "GET",
                "path": "/api/now/table/incident",
                "table_selector": "incident",
                "filter_query": "priority=1^state!=6^state!=7",
                "sysparm_count": True,
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.result[0].count"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "SLA Breaches",
            "metric_key": "sla_breaches",
            "description": "Number of incidents that have breached their SLA",
            "category": "incident",
            "display_order": 3,
            "metric_type": "number",
            "unit": "incidents",
            "aggregation_type": "count",
            "threshold_warning": 5,
            "threshold_critical": 20,
            "query_config": {
                "method": "GET",
                "path": "/api/now/table/task_sla",
                "table_selector": "task_sla",
                "filter_query": "has_breached=true^stage=breached",
                "sysparm_count": True,
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.result[0].count"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Avg Resolution Time",
            "metric_key": "avg_resolution_time",
            "description": "Average time to resolve incidents in hours",
            "category": "incident",
            "display_order": 4,
            "metric_type": "duration",
            "unit": "hours",
            "aggregation_type": "avg",
            "threshold_warning": 4,
            "threshold_critical": 8,
            "query_config": {
                "method": "GET",
                "path": "/api/now/stats/incident",
                "table_selector": "incident",
                "filter_query": "state=6^resolved_atONLast 7 days@javascript:gs.beginningOfLast7Days()@javascript:gs.endOfLast7Days()",
                "sysparm_avg_fields": "calendar_duration",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.result.stats.avg.calendar_duration.display_value"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Ticket Backlog",
            "metric_key": "ticket_backlog",
            "description": "Total unresolved ticket count across all queues",
            "category": "incident",
            "display_order": 5,
            "metric_type": "number",
            "unit": "tickets",
            "aggregation_type": "count",
            "threshold_warning": 100,
            "threshold_critical": 500,
            "query_config": {
                "method": "GET",
                "path": "/api/now/table/incident",
                "table_selector": "incident",
                "filter_query": "state!=6^state!=7^state!=8",
                "sysparm_count": True,
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.result[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Escalations",
            "metric_key": "escalations",
            "description": "Count of incidents escalated in the last 24 hours",
            "category": "incident",
            "display_order": 6,
            "metric_type": "number",
            "unit": "escalations",
            "aggregation_type": "count",
            "threshold_warning": 5,
            "threshold_critical": 20,
            "query_config": {
                "method": "GET",
                "path": "/api/now/table/incident",
                "table_selector": "incident",
                "filter_query": "escalation>0^sys_updated_onONLast 24 hours@javascript:gs.beginningOfYesterday()@javascript:gs.endOfYesterday()",
                "sysparm_count": True,
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.result[0].count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
    ],
    "universal-rest": [
        {
            "name": "HTTP Status Success Rate",
            "metric_key": "http_success_rate",
            "description": "Percentage of HTTP requests returning 2xx status codes",
            "category": "api",
            "display_order": 1,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "avg",
            "threshold_warning": 95,
            "threshold_critical": 90,
            "query_config": {
                "method": "GET",
                "path": "/health",
                "endpoint": "{base_url}/health",
                "headers": {},
                "body": None,
                "json_path": "$.status",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.success_rate"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Error Rate",
            "metric_key": "error_rate",
            "description": "Percentage of requests that returned an error response",
            "category": "api",
            "display_order": 2,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "avg",
            "threshold_warning": 5,
            "threshold_critical": 10,
            "query_config": {
                "method": "GET",
                "path": "/metrics",
                "endpoint": "{base_url}/metrics",
                "headers": {},
                "body": None,
                "json_path": "$.error_rate",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.error_rate"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Response Time",
            "metric_key": "response_time",
            "description": "API endpoint average response time in milliseconds",
            "category": "api",
            "display_order": 3,
            "metric_type": "duration",
            "unit": "ms",
            "aggregation_type": "avg",
            "threshold_warning": 500,
            "threshold_critical": 2000,
            "query_config": {
                "method": "GET",
                "path": "/health",
                "endpoint": "{base_url}/health",
                "headers": {},
                "body": None,
                "json_path": "$.response_time_ms",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.response_time_ms"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Payload Size",
            "metric_key": "payload_size",
            "description": "Average response payload size in kilobytes",
            "category": "api",
            "display_order": 4,
            "metric_type": "number",
            "unit": "KB",
            "aggregation_type": "avg",
            "threshold_warning": 500,
            "threshold_critical": 2048,
            "query_config": {
                "method": "GET",
                "path": "/metrics",
                "endpoint": "{base_url}/metrics",
                "headers": {},
                "body": None,
                "json_path": "$.avg_payload_kb",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.avg_payload_kb"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Availability",
            "metric_key": "availability",
            "description": "Service availability based on health endpoint reachability",
            "category": "api",
            "display_order": 5,
            "metric_type": "boolean",
            "unit": None,
            "aggregation_type": "latest",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "GET",
                "path": "{health_path}",
                "endpoint": "{base_url}{health_path}",
                "headers": {},
                "body": None,
                "json_path": "$.status",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.status"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
    ],
    "universal-sql": [
        {
            "name": "Query Execution Time",
            "metric_key": "query_execution_time",
            "description": "Average query execution time in milliseconds",
            "category": "database",
            "display_order": 1,
            "metric_type": "duration",
            "unit": "ms",
            "aggregation_type": "avg",
            "threshold_warning": 1000,
            "threshold_critical": 5000,
            "query_config": {
                "method": "POST",
                "path": "/query",
                "sql_query": "SELECT avg_exec_time FROM pg_stat_statements ORDER BY avg_exec_time DESC LIMIT 1",
                "column_mapping": {"value": "avg_exec_time"},
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.rows[0].avg_exec_time"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Row Count",
            "metric_key": "row_count",
            "description": "Total row count across monitored tables",
            "category": "database",
            "display_order": 2,
            "metric_type": "number",
            "unit": "rows",
            "aggregation_type": "sum",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "POST",
                "path": "/query",
                "sql_query": "SELECT sum(n_live_tup) as row_count FROM pg_stat_user_tables",
                "column_mapping": {"value": "row_count"},
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.rows[0].row_count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Error Count",
            "metric_key": "db_error_count",
            "description": "Database-level error count from system logs",
            "category": "database",
            "display_order": 3,
            "metric_type": "number",
            "unit": "errors",
            "aggregation_type": "sum",
            "threshold_warning": 10,
            "threshold_critical": 50,
            "query_config": {
                "method": "POST",
                "path": "/query",
                "sql_query": "SELECT count(*) as error_count FROM pg_stat_activity WHERE state = 'idle in transaction (aborted)'",
                "column_mapping": {"value": "error_count"},
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.rows[0].error_count"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Connection Count",
            "metric_key": "connection_count",
            "description": "Current number of active database connections",
            "category": "database",
            "display_order": 4,
            "metric_type": "number",
            "unit": "connections",
            "aggregation_type": "latest",
            "threshold_warning": 80,
            "threshold_critical": 100,
            "query_config": {
                "method": "POST",
                "path": "/query",
                "sql_query": "SELECT count(*) as connection_count FROM pg_stat_activity WHERE state != 'idle'",
                "column_mapping": {"value": "connection_count"},
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.rows[0].connection_count"},
            "is_enabled_by_default": True,
            "is_required": True,
        },
        {
            "name": "Deadlocks",
            "metric_key": "deadlocks",
            "description": "Number of deadlock events detected",
            "category": "database",
            "display_order": 5,
            "metric_type": "number",
            "unit": "deadlocks",
            "aggregation_type": "sum",
            "threshold_warning": 1,
            "threshold_critical": 5,
            "query_config": {
                "method": "POST",
                "path": "/query",
                "sql_query": "SELECT sum(deadlocks) as deadlocks FROM pg_stat_database",
                "column_mapping": {"value": "deadlocks"},
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.rows[0].deadlocks"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
        {
            "name": "Table Growth",
            "metric_key": "table_growth",
            "description": "Rate of table size growth in megabytes per hour",
            "category": "database",
            "display_order": 6,
            "metric_type": "number",
            "unit": "MB/hr",
            "aggregation_type": "avg",
            "threshold_warning": 100,
            "threshold_critical": 500,
            "query_config": {
                "method": "POST",
                "path": "/query",
                "sql_query": "SELECT pg_size_pretty(sum(pg_total_relation_size(relid))) as total_size FROM pg_stat_user_tables",
                "column_mapping": {"value": "total_size"},
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.rows[0].total_size"},
            "is_enabled_by_default": True,
            "is_required": False,
        },
    ],
    "prometheus": [
        {
            "name": "Scrape Target Status",
            "metric_key": "scrape_target_status",
            "description": "Number of scrape targets in UP state",
            "category": "metrics",
            "display_order": 1,
            "metric_type": "number",
            "unit": "targets",
            "aggregation_type": "latest",
            "threshold_warning": 1,
            "threshold_critical": 2,
            "query_config": {
                "method": "GET",
                "path": "/api/v1/targets",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.data.activeTargets"},
            "is_enabled_by_default": True,
            "is_required": True,
        }
    ],
    "pcf": [
        {
            "name": "Diego App Instance Usage",
            "metric_key": "diego_app_usage",
            "description": "Diego apps overall CPU and Memory allocation percent",
            "category": "cloud",
            "display_order": 1,
            "metric_type": "percentage",
            "unit": "%",
            "aggregation_type": "avg",
            "threshold_warning": 80,
            "threshold_critical": 95,
            "query_config": {
                "method": "GET",
                "path": "/v3/apps",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.resources"},
            "is_enabled_by_default": True,
            "is_required": True,
        }
    ],
    "vm": [
        {
            "name": "Active VMs Count",
            "metric_key": "active_vms_count",
            "description": "Total number of powered-on virtual machines",
            "category": "infrastructure",
            "display_order": 1,
            "metric_type": "number",
            "unit": "vms",
            "aggregation_type": "latest",
            "threshold_warning": None,
            "threshold_critical": None,
            "query_config": {
                "method": "GET",
                "path": "/api/vcenter/vm",
            },
            "parser_type": "json_path",
            "result_mapping": {"value_path": "$.value"},
            "is_enabled_by_default": True,
            "is_required": True,
        }
    ],
}


async def _seed_rbac_permissions():
    from app.services.rbac_service import rbac_service
    try:
        async with AsyncSessionLocal() as session:
            await rbac_service.seed_permissions(session)
            logger.info("RBAC permissions seeded/verified")
    except Exception as exc:
        logger.error(f"RBAC permission seeding failed: {exc}")


async def _seed_metric_templates():
    from sqlalchemy import select
    from app.models.connector_catalog import ConnectorCatalogEntry
    from app.models.metric_template import MetricTemplate, MetricType, AggregationType, ParserType

    logger.info("Checking metric templates for seed entries...")
    seeded = 0
    skipped = 0

    try:
        async with AsyncSessionLocal() as session:
            for connector_slug, templates in _DEFAULT_METRIC_TEMPLATES.items():
                catalog_result = await session.execute(
                    select(ConnectorCatalogEntry).where(ConnectorCatalogEntry.slug == connector_slug)
                )
                catalog_entry = catalog_result.scalar_one_or_none()
                if not catalog_entry:
                    logger.warning(f"  [skip] Catalog entry not found for slug: {connector_slug}")
                    continue

                for tmpl_data in templates:
                    existing_result = await session.execute(
                        select(MetricTemplate).where(
                            MetricTemplate.catalog_entry_id == catalog_entry.id,
                            MetricTemplate.metric_key == tmpl_data["metric_key"],
                        )
                    )
                    if existing_result.scalar_one_or_none():
                        skipped += 1
                        continue

                    tmpl = MetricTemplate(
                        id=str(uuid.uuid4()),
                        catalog_entry_id=catalog_entry.id,
                        name=tmpl_data["name"],
                        metric_key=tmpl_data["metric_key"],
                        description=tmpl_data.get("description"),
                        category=tmpl_data.get("category"),
                        display_order=tmpl_data.get("display_order", 0),
                        metric_type=MetricType(tmpl_data.get("metric_type", "number")),
                        unit=tmpl_data.get("unit"),
                        aggregation_type=AggregationType(tmpl_data.get("aggregation_type", "latest")),
                        threshold_warning=tmpl_data.get("threshold_warning"),
                        threshold_critical=tmpl_data.get("threshold_critical"),
                        query_config=tmpl_data.get("query_config"),
                        parser_type=ParserType(tmpl_data.get("parser_type", "json_path")),
                        result_mapping=tmpl_data.get("result_mapping"),
                        transformation_rules=None,
                        is_enabled_by_default=tmpl_data.get("is_enabled_by_default", True),
                        is_required=tmpl_data.get("is_required", False),
                        is_custom=False,
                        created_by=None,
                    )
                    session.add(tmpl)
                    seeded += 1
                    logger.info(f"  [seed] metric template: {connector_slug}/{tmpl_data['metric_key']}")

            await session.commit()

        if seeded:
            logger.info(f"Metric template seeding complete: {seeded} templates created, {skipped} already existed")
        else:
            logger.info(f"Metric templates: all {skipped} templates already exist")

    except Exception as exc:
        logger.error(f"Metric template seeding failed: {exc}")
