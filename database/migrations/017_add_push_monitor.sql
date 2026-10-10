CREATE TABLE push_monitor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  worker_started_at TIMESTAMPTZ,
  worker_succeeded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_error TEXT,
  last_failed_delivery_id BIGINT NOT NULL DEFAULT 0,
  incident_started_at TIMESTAMPTZ,
  last_alert_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ
);
INSERT INTO push_monitor_state(id) VALUES(1);
