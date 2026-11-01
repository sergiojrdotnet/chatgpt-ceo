-- Operator-only bootstrap. The CEO runtime account has SELECT/INSERT, no DDL.
CREATE DATABASE IF NOT EXISTS ceo;
CREATE TABLE IF NOT EXISTS ceo.coordination_events
(
    event_id UUID,
    action LowCardinality(String),
    scope_type LowCardinality(String),
    scope_id String,
    issue_id Nullable(UUID),
    issue_identifier Nullable(String),
    phase Nullable(String),
    reason String,
    result String,
    outcome LowCardinality(String),
    observed_at DateTime64(3, 'UTC'),
    recorded_at DateTime64(3, 'UTC'),
    producer_id String,
    evidence_refs Array(String),
    thread_id Nullable(String),
    turn_id Nullable(String),
    correlation_id Nullable(String),
    corrects_event_id Nullable(UUID)
)
ENGINE = MergeTree
ORDER BY (recorded_at, event_id);
