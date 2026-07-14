-- Migration: add_ontology_and_dc_exit_session
-- Created: 2026-07-14
-- Adds three new tables: ontology_nodes, ontology_edges, dc_exit_sessions
-- No existing tables are modified.

-- ── ontology_nodes ────────────────────────────────────────────────
CREATE TABLE ontology_nodes (
    id              VARCHAR PRIMARY KEY,
    node_key        VARCHAR NOT NULL UNIQUE,
    label           VARCHAR NOT NULL,
    domain          VARCHAR NOT NULL,
    ontology_class  VARCHAR NOT NULL,
    sub_class_of    VARCHAR,
    icon            VARCHAR,
    color           VARCHAR,
    status          VARCHAR DEFAULT 'healthy',
    is_root         BOOLEAN DEFAULT 0,
    parent_id       VARCHAR REFERENCES ontology_nodes(id) ON DELETE CASCADE,
    properties_json JSON,
    metadata_json   JSON,
    tenant_id       VARCHAR NOT NULL DEFAULT 'default',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_ontology_nodes_node_key  ON ontology_nodes (node_key);
CREATE INDEX ix_ontology_nodes_domain    ON ontology_nodes (domain);
CREATE INDEX ix_ontology_nodes_parent_id ON ontology_nodes (parent_id);

-- ── ontology_edges ────────────────────────────────────────────────
CREATE TABLE ontology_edges (
    id               VARCHAR PRIMARY KEY,
    source_node_id   VARCHAR NOT NULL REFERENCES ontology_nodes(id) ON DELETE CASCADE,
    target_node_id   VARCHAR NOT NULL REFERENCES ontology_nodes(id) ON DELETE CASCADE,
    edge_type        VARCHAR NOT NULL,
    label            VARCHAR,
    is_animated      BOOLEAN DEFAULT 0,
    weight           INTEGER DEFAULT 1,
    properties_json  JSON,
    metadata_json    JSON,
    tenant_id        VARCHAR NOT NULL DEFAULT 'default',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_ontology_edges_source_node_id ON ontology_edges (source_node_id);
CREATE INDEX ix_ontology_edges_target_node_id ON ontology_edges (target_node_id);

-- ── dc_exit_sessions ──────────────────────────────────────────────
CREATE TABLE dc_exit_sessions (
    id                  VARCHAR PRIMARY KEY,
    session_key         VARCHAR NOT NULL UNIQUE,
    name                VARCHAR,
    description         TEXT,
    current_step        VARCHAR NOT NULL DEFAULT 'discover',
    status              VARCHAR DEFAULT 'pending',
    data_center_short   VARCHAR,
    project_id          VARCHAR,
    tenant_id           VARCHAR NOT NULL DEFAULT 'default',
    phase_state_json    JSON,
    discover_data_json  JSON,
    analyze_data_json   JSON,
    decide_data_json    JSON,
    execute_data_json   JSON,
    validate_data_json  JSON,
    created_by          VARCHAR,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_dc_exit_sessions_session_key       ON dc_exit_sessions (session_key);
CREATE INDEX ix_dc_exit_sessions_data_center_short ON dc_exit_sessions (data_center_short);
CREATE INDEX ix_dc_exit_sessions_project_id        ON dc_exit_sessions (project_id);
