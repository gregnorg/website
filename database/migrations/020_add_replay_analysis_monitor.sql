CREATE TABLE IF NOT EXISTS pushfight_analysis_monitor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  endpoint TEXT,
  incident_started_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  last_alert_at TIMESTAMPTZ,
  last_error TEXT
);
INSERT INTO pushfight_analysis_monitor_state(id) VALUES (1) ON CONFLICT DO NOTHING;
