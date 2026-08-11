CREATE TABLE IF NOT EXISTS topik_app.tts_generation_job_targets (
    job_id UUID NOT NULL REFERENCES topik_app.tts_generation_jobs(job_id) ON DELETE CASCADE,
    item_id UUID NOT NULL,
    item_version INTEGER NOT NULL CHECK (item_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id, item_id, item_version),
    FOREIGN KEY (item_id, item_version)
        REFERENCES topik_bank.item_versions(item_id, item_version)
);

CREATE INDEX IF NOT EXISTS tts_job_targets_item_idx
    ON topik_app.tts_generation_job_targets(item_id, item_version, job_id);

INSERT INTO topik_app.tts_generation_job_targets(job_id, item_id, item_version)
SELECT job_id, item_id, item_version
  FROM topik_app.tts_generation_jobs
ON CONFLICT DO NOTHING;

ALTER TABLE topik_app.email_subscriptions
    DROP CONSTRAINT IF EXISTS email_subscriptions_session_id_fkey;

ALTER TABLE topik_app.email_subscriptions
    ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE topik_app.email_subscriptions
    ADD CONSTRAINT email_subscriptions_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES topik_app.sessions(session_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS topik_app.response_deletion_audits (
    deletion_audit_id UUID PRIMARY KEY,
    deleted_by UUID NOT NULL REFERENCES topik_app.admin_users(admin_user_id),
    deletion_scope TEXT NOT NULL CHECK (deletion_scope IN ('selected_sessions', 'all_response_sessions')),
    deleted_session_count INTEGER NOT NULL CHECK (deleted_session_count >= 0),
    deleted_observation_count INTEGER NOT NULL CHECK (deleted_observation_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS response_deletion_audits_created_idx
    ON topik_app.response_deletion_audits(created_at DESC);
