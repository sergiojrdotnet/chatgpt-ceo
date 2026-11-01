-- Exact schema-3 DDL from deployed 0d8a8cb; synthetic migration fixture only.
CREATE TABLE IF NOT EXISTS policy(
        revision INTEGER PRIMARY KEY CHECK(revision>0), digest TEXT NOT NULL,
        profile_id TEXT NOT NULL, effective_at TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN(0,1)),
        fixture_only INTEGER NOT NULL CHECK(fixture_only IN(0,1)), execution_enabled INTEGER NOT NULL CHECK(execution_enabled IN(0,1)),
        owner_ref TEXT NOT NULL, timezone TEXT NOT NULL,
        preferred_min INTEGER NOT NULL CHECK(preferred_min>0),preferred_max INTEGER NOT NULL CHECK(preferred_max>=preferred_min),
        active_max INTEGER NOT NULL CHECK(active_max>=preferred_max),urgent_max INTEGER NOT NULL CHECK(urgent_max=active_max+1),
        administrative_start TEXT NOT NULL,administrative_end TEXT NOT NULL CHECK(administrative_end>administrative_start),
        low_activity INTEGER NOT NULL CHECK(low_activity IN(0,1))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS bindings(revision INTEGER PRIMARY KEY REFERENCES policy(revision),linear_workspace TEXT NOT NULL,linear_team TEXT NOT NULL,erp_connection TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS repositories(revision INTEGER NOT NULL REFERENCES policy(revision),position INTEGER NOT NULL CHECK(position>=0),repository TEXT NOT NULL,PRIMARY KEY(revision,position),UNIQUE(revision,repository)) STRICT;
      CREATE TABLE IF NOT EXISTS agents(revision INTEGER NOT NULL REFERENCES policy(revision),id TEXT NOT NULL,position INTEGER NOT NULL CHECK(position>=0),name TEXT NOT NULL,description TEXT NOT NULL,instructions TEXT NOT NULL,model TEXT NOT NULL,effort TEXT NOT NULL CHECK(effort IN('low','medium','high','xhigh','max','ultra')),environment TEXT,PRIMARY KEY(revision,id),UNIQUE(revision,position)) STRICT;
      CREATE TABLE IF NOT EXISTS coordination_events(
        seq INTEGER PRIMARY KEY CHECK(seq>0),event_id TEXT NOT NULL UNIQUE,
        action TEXT NOT NULL CHECK(action IN('planning','selection','delegation','execution','release-plan','publication','handoff','validation','incident','administration','configuration','correction')),
        scope_type TEXT NOT NULL CHECK(scope_type IN('issue','project','configuration','incident')),scope_id TEXT NOT NULL,
        issue_id TEXT,phase TEXT CHECK(phase IN('implementation','release','validation')),
        reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),result TEXT NOT NULL CHECK(length(result) BETWEEN 1 AND 2000),
        outcome TEXT NOT NULL CHECK(outcome IN('planned','confirmed','failed','uncertain','blocked','deferred')),
        observed_at TEXT NOT NULL,recorded_at TEXT NOT NULL,producer_id TEXT NOT NULL,
        configuration_revision INTEGER NOT NULL REFERENCES policy(revision),
        thread_id TEXT,turn_id TEXT CHECK(turn_id IS NULL OR thread_id IS NOT NULL),correlation_id TEXT,
        corrects_event_id TEXT REFERENCES coordination_events(event_id),evidence_count INTEGER NOT NULL CHECK(evidence_count BETWEEN 0 AND 30),
        CHECK(scope_type!='issue' OR (issue_id IS NOT NULL AND issue_id=scope_id)),
        CHECK((action='correction' AND corrects_event_id IS NOT NULL) OR (action!='correction' AND corrects_event_id IS NULL)),
        CHECK(outcome NOT IN('confirmed','failed') OR evidence_count>0)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS events_issue ON coordination_events(issue_id,seq);
      CREATE INDEX IF NOT EXISTS events_scope ON coordination_events(scope_type,scope_id,seq);
      CREATE INDEX IF NOT EXISTS events_action ON coordination_events(action,seq);
      CREATE INDEX IF NOT EXISTS events_time ON coordination_events(observed_at,seq);
      CREATE TABLE IF NOT EXISTS event_evidence(event_id TEXT NOT NULL REFERENCES coordination_events(event_id),position INTEGER NOT NULL CHECK(position>=0),reference TEXT NOT NULL CHECK(length(reference) BETWEEN 1 AND 500),PRIMARY KEY(event_id,position),UNIQUE(event_id,reference)) STRICT;
      CREATE TRIGGER IF NOT EXISTS evidence_bound BEFORE INSERT ON event_evidence WHEN NEW.position >= (SELECT evidence_count FROM coordination_events WHERE event_id=NEW.event_id) BEGIN SELECT RAISE(ABORT,'EVIDENCE_LIMIT'); END;
      CREATE TRIGGER IF NOT EXISTS correction_scope BEFORE INSERT ON coordination_events WHEN NEW.corrects_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM coordination_events WHERE event_id=NEW.corrects_event_id AND scope_type=NEW.scope_type AND scope_id=NEW.scope_id AND issue_id IS NEW.issue_id) BEGIN SELECT RAISE(ABORT,'CORRECTION_SCOPE_MISMATCH'); END;
      CREATE TABLE IF NOT EXISTS requests(actor TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,operation TEXT NOT NULL CHECK(operation IN('configuration','event')),result_revision INTEGER NOT NULL REFERENCES policy(revision),event_id TEXT REFERENCES coordination_events(event_id),PRIMARY KEY(actor,id),CHECK((operation='event')=(event_id IS NOT NULL))) STRICT;
      CREATE TABLE IF NOT EXISTS store_identity(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY,actor TEXT NOT NULL,operation TEXT NOT NULL,revision INTEGER NOT NULL,at TEXT NOT NULL) STRICT;
CREATE TRIGGER immutable_policy_UPDATE BEFORE UPDATE ON policy BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_policy_DELETE BEFORE DELETE ON policy BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_bindings_UPDATE BEFORE UPDATE ON bindings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_bindings_DELETE BEFORE DELETE ON bindings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_repositories_UPDATE BEFORE UPDATE ON repositories BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_repositories_DELETE BEFORE DELETE ON repositories BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_agents_UPDATE BEFORE UPDATE ON agents BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_agents_DELETE BEFORE DELETE ON agents BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_coordination_events_UPDATE BEFORE UPDATE ON coordination_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_coordination_events_DELETE BEFORE DELETE ON coordination_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_event_evidence_UPDATE BEFORE UPDATE ON event_evidence BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_event_evidence_DELETE BEFORE DELETE ON event_evidence BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_requests_UPDATE BEFORE UPDATE ON requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_requests_DELETE BEFORE DELETE ON requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_audit_UPDATE BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_audit_DELETE BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_store_identity_UPDATE BEFORE UPDATE ON store_identity BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
CREATE TRIGGER immutable_store_identity_DELETE BEFORE DELETE ON store_identity BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;
PRAGMA user_version=3;
