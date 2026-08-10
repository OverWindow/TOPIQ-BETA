CREATE SCHEMA IF NOT EXISTS topik_app;

CREATE TABLE IF NOT EXISTS topik_app.schema_migrations (
    version TEXT PRIMARY KEY,
    checksum CHAR(64),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topik_app.mock_tests (
    mock_test_id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title_id TEXT NOT NULL,
    title_ko TEXT NOT NULL,
    description_id TEXT NOT NULL,
    description_ko TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
    question_count SMALLINT NOT NULL CHECK (question_count > 0),
    max_score SMALLINT NOT NULL CHECK (max_score > 0),
    display_order SMALLINT NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topik_app.mock_test_sections (
    mock_test_id UUID NOT NULL REFERENCES topik_app.mock_tests(mock_test_id) ON DELETE CASCADE,
    section_order SMALLINT NOT NULL CHECK (section_order > 0),
    section TEXT NOT NULL CHECK (section IN ('reading', 'listening', 'writing')),
    set_id UUID NOT NULL,
    set_version INTEGER NOT NULL CHECK (set_version > 0),
    PRIMARY KEY (mock_test_id, section_order),
    UNIQUE (mock_test_id, set_id, set_version),
    FOREIGN KEY (set_id, set_version)
        REFERENCES topik_bank.question_set_versions(set_id, set_version)
);

CREATE TABLE IF NOT EXISTS topik_app.users (
    user_id UUID PRIMARY KEY,
    identity_type TEXT NOT NULL DEFAULT 'session_ephemeral'
        CHECK (identity_type = 'session_ephemeral'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topik_app.sessions (
    session_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES topik_app.users(user_id),
    mock_test_id UUID NOT NULL REFERENCES topik_app.mock_tests(mock_test_id),
    mode TEXT NOT NULL CHECK (mode IN ('timed', 'practice')),
    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'submitted')),
    access_token_hash CHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    results_unlocked_at TIMESTAMPTZ,
    score SMALLINT,
    max_score SMALLINT NOT NULL,
    timed_out_submission BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((mode = 'timed' AND expires_at IS NOT NULL) OR (mode = 'practice' AND expires_at IS NULL)),
    CHECK ((status = 'submitted' AND submitted_at IS NOT NULL) OR status = 'in_progress')
);

CREATE INDEX IF NOT EXISTS sessions_user_created_idx
    ON topik_app.sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx
    ON topik_app.sessions(status, expires_at)
    WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS topik_app.session_items (
    session_id UUID NOT NULL REFERENCES topik_app.sessions(session_id) ON DELETE CASCADE,
    item_order SMALLINT NOT NULL CHECK (item_order > 0),
    section TEXT NOT NULL CHECK (section IN ('reading', 'listening', 'writing')),
    test_position SMALLINT NOT NULL CHECK (test_position > 0),
    set_id UUID NOT NULL,
    set_version INTEGER NOT NULL CHECK (set_version > 0),
    item_id UUID NOT NULL,
    item_version INTEGER NOT NULL CHECK (item_version > 0),
    score_weight SMALLINT NOT NULL DEFAULT 2 CHECK (score_weight > 0),
    policy_version TEXT NOT NULL DEFAULT 'STATIC_MOCK_V1',
    theta_before DOUBLE PRECISION,
    theta_after DOUBLE PRECISION,
    PRIMARY KEY (session_id, item_order),
    UNIQUE (session_id, item_id, item_version),
    UNIQUE (session_id, set_id, set_version, test_position),
    FOREIGN KEY (set_id, set_version)
        REFERENCES topik_bank.question_set_versions(set_id, set_version),
    FOREIGN KEY (item_id, item_version)
        REFERENCES topik_bank.item_versions(item_id, item_version)
);

CREATE TABLE IF NOT EXISTS topik_app.answer_states (
    session_id UUID NOT NULL,
    item_order SMALLINT NOT NULL,
    selected_option SMALLINT NOT NULL CHECK (selected_option BETWEEN 1 AND 4),
    first_selected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    final_selected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    selection_count INTEGER NOT NULL DEFAULT 1 CHECK (selection_count > 0),
    PRIMARY KEY (session_id, item_order),
    FOREIGN KEY (session_id, item_order)
        REFERENCES topik_app.session_items(session_id, item_order) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS topik_app.response_events (
    event_id UUID PRIMARY KEY,
    client_event_id UUID NOT NULL UNIQUE,
    session_id UUID NOT NULL,
    item_order SMALLINT NOT NULL,
    event_type TEXT NOT NULL CHECK (
        event_type IN ('presented', 'hidden', 'heartbeat', 'answer_selected', 'answer_changed')
    ),
    selected_option SMALLINT CHECK (selected_option BETWEEN 1 AND 4),
    active_duration_delta_ms INTEGER NOT NULL DEFAULT 0
        CHECK (active_duration_delta_ms BETWEEN 0 AND 60000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id, item_order)
        REFERENCES topik_app.session_items(session_id, item_order) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS response_events_session_item_idx
    ON topik_app.response_events(session_id, item_order, created_at);

CREATE TABLE IF NOT EXISTS topik_app.theta_estimation_runs (
    estimation_run_id UUID PRIMARY KEY,
    estimator_version TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    dataset_description TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS topik_app.response_observations (
    observation_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES topik_app.users(user_id),
    session_id UUID NOT NULL,
    item_id UUID NOT NULL,
    item_version INTEGER NOT NULL,
    item_order SMALLINT NOT NULL CHECK (item_order > 0),
    selected_option SMALLINT CHECK (selected_option BETWEEN 1 AND 4),
    is_correct BOOLEAN NOT NULL,
    response_time_ms INTEGER NOT NULL DEFAULT 0 CHECK (response_time_ms >= 0),
    skipped BOOLEAN NOT NULL DEFAULT FALSE,
    timed_out BOOLEAN NOT NULL DEFAULT FALSE,
    answer_changed BOOLEAN NOT NULL DEFAULT FALSE,
    theta_before DOUBLE PRECISION,
    theta_after DOUBLE PRECISION,
    policy_version TEXT NOT NULL,
    estimation_run_id UUID REFERENCES topik_app.theta_estimation_runs(estimation_run_id),
    estimator_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (session_id, item_order),
    CHECK (NOT (skipped AND timed_out)),
    FOREIGN KEY (session_id, item_order)
        REFERENCES topik_app.session_items(session_id, item_order),
    FOREIGN KEY (item_id, item_version)
        REFERENCES topik_bank.item_versions(item_id, item_version)
);

CREATE INDEX IF NOT EXISTS response_observations_item_idx
    ON topik_app.response_observations(item_id, item_version, created_at);
CREATE INDEX IF NOT EXISTS response_observations_policy_idx
    ON topik_app.response_observations(policy_version, created_at);

CREATE TABLE IF NOT EXISTS topik_app.attempt_feedback (
    session_id UUID PRIMARY KEY REFERENCES topik_app.sessions(session_id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    locale TEXT NOT NULL CHECK (locale IN ('id', 'ko')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topik_app.email_subscriptions (
    subscription_id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES topik_app.sessions(session_id),
    email_normalized TEXT NOT NULL UNIQUE,
    email_original TEXT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('id', 'ko')),
    consented_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at TIMESTAMPTZ,
    source TEXT NOT NULL DEFAULT 'topik_mock_result'
);

INSERT INTO topik_app.mock_tests(
    mock_test_id, slug, title_id, title_ko, description_id, description_ko,
    duration_seconds, question_count, max_score, display_order, is_published
) VALUES
    (
        '10000000-0000-4000-8000-000000000001',
        'topik-ii-reading-1',
        'Simulasi TOPIK II Membaca 1',
        'TOPIK II 읽기 모의고사 1회',
        '50 soal membaca dengan format TOPIK II.',
        'TOPIK II 형식의 읽기 50문항입니다.',
        4200, 50, 100, 1, TRUE
    ),
    (
        '10000000-0000-4000-8000-000000000002',
        'topik-ii-reading-2',
        'Simulasi TOPIK II Membaca 2',
        'TOPIK II 읽기 모의고사 2회',
        '50 soal membaca dengan format TOPIK II.',
        'TOPIK II 형식의 읽기 50문항입니다.',
        4200, 50, 100, 2, TRUE
    )
ON CONFLICT (mock_test_id) DO UPDATE SET
    title_id = EXCLUDED.title_id,
    title_ko = EXCLUDED.title_ko,
    description_id = EXCLUDED.description_id,
    description_ko = EXCLUDED.description_ko,
    duration_seconds = EXCLUDED.duration_seconds,
    question_count = EXCLUDED.question_count,
    max_score = EXCLUDED.max_score,
    display_order = EXCLUDED.display_order,
    is_published = EXCLUDED.is_published,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO topik_app.mock_test_sections(
    mock_test_id, section_order, section, set_id, set_version
) VALUES
    (
        '10000000-0000-4000-8000-000000000001', 1, 'reading',
        '64c027ea-fa18-5cd3-8039-79ecde41916a', 1
    ),
    (
        '10000000-0000-4000-8000-000000000002', 1, 'reading',
        'fc0a5fa7-391e-586f-ab7c-1b7b8193358a', 1
    )
ON CONFLICT (mock_test_id, section_order) DO UPDATE SET
    section = EXCLUDED.section,
    set_id = EXCLUDED.set_id,
    set_version = EXCLUDED.set_version;
