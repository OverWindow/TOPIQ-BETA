CREATE TABLE IF NOT EXISTS topik_app.admin_users (
    admin_user_id UUID PRIMARY KEY,
    auth_user_id UUID NOT NULL UNIQUE,
    email_normalized TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topik_app.tts_audio_assets (
    audio_asset_id UUID PRIMARY KEY,
    source_hash CHAR(64) NOT NULL,
    provider TEXT NOT NULL DEFAULT 'google_cloud_tts',
    model_name TEXT NOT NULL,
    language_code TEXT NOT NULL DEFAULT 'ko-KR',
    female_voice TEXT NOT NULL,
    male_voice TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
    storage_bucket TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    duration_ms INTEGER,
    created_by UUID REFERENCES topik_app.admin_users(admin_user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_hash, model_name, female_voice, male_voice)
);

CREATE TABLE IF NOT EXISTS topik_app.item_audio_bindings (
    item_id UUID NOT NULL,
    item_version INTEGER NOT NULL CHECK (item_version > 0),
    audio_asset_id UUID NOT NULL REFERENCES topik_app.tts_audio_assets(audio_asset_id),
    source_hash CHAR(64) NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id, item_version, audio_asset_id),
    FOREIGN KEY (item_id, item_version)
        REFERENCES topik_bank.item_versions(item_id, item_version)
);
CREATE UNIQUE INDEX IF NOT EXISTS item_audio_current_idx
    ON topik_app.item_audio_bindings(item_id, item_version) WHERE is_current;

CREATE TABLE IF NOT EXISTS topik_app.tts_generation_jobs (
    job_id UUID PRIMARY KEY,
    item_id UUID NOT NULL,
    item_version INTEGER NOT NULL CHECK (item_version > 0),
    requested_by UUID NOT NULL REFERENCES topik_app.admin_users(admin_user_id),
    force_regenerate BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
    lease_expires_at TIMESTAMPTZ,
    error_message TEXT,
    audio_asset_id UUID REFERENCES topik_app.tts_audio_assets(audio_asset_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    FOREIGN KEY (item_id, item_version)
        REFERENCES topik_bank.item_versions(item_id, item_version)
);
CREATE INDEX IF NOT EXISTS tts_jobs_worker_idx
    ON topik_app.tts_generation_jobs(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS tts_jobs_active_item_idx
    ON topik_app.tts_generation_jobs(item_id, item_version)
    WHERE status IN ('queued', 'processing');

CREATE TABLE IF NOT EXISTS topik_app.item_visual_assets (
    visual_asset_id UUID PRIMARY KEY,
    item_id UUID NOT NULL,
    item_version INTEGER NOT NULL CHECK (item_version > 0),
    option_number SMALLINT NOT NULL CHECK (option_number BETWEEN 1 AND 4),
    storage_bucket TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    created_by UUID REFERENCES topik_app.admin_users(admin_user_id),
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id, item_version)
        REFERENCES topik_bank.item_versions(item_id, item_version)
);
CREATE UNIQUE INDEX IF NOT EXISTS item_visual_current_idx
    ON topik_app.item_visual_assets(item_id, item_version, option_number) WHERE is_current;

CREATE TABLE IF NOT EXISTS topik_app.audio_playback_events (
    playback_event_id UUID PRIMARY KEY,
    client_play_id UUID NOT NULL,
    session_id UUID NOT NULL REFERENCES topik_app.sessions(session_id) ON DELETE CASCADE,
    audio_asset_id UUID NOT NULL REFERENCES topik_app.tts_audio_assets(audio_asset_id),
    event_type TEXT NOT NULL CHECK (event_type IN ('started', 'completed', 'interrupted')),
    play_number SMALLINT NOT NULL CHECK (play_number > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (client_play_id, event_type)
);
CREATE INDEX IF NOT EXISTS audio_playback_session_asset_idx
    ON topik_app.audio_playback_events(session_id, audio_asset_id, created_at);

INSERT INTO topik_app.mock_tests(
    mock_test_id, slug, title_id, title_ko, description_id, description_ko,
    duration_seconds, question_count, max_score, display_order, is_published
) VALUES
    (
        '10000000-0000-4000-8000-000000000003',
        'topik-ii-listening-1',
        'Simulasi TOPIK II Menyimak 1',
        'TOPIK II 듣기 모의고사 1회',
        '50 soal menyimak dengan format TOPIK II.',
        'TOPIK II 형식의 듣기 50문항입니다.',
        3600, 50, 100, 3, FALSE
    ),
    (
        '10000000-0000-4000-8000-000000000004',
        'topik-ii-listening-2',
        'Simulasi TOPIK II Menyimak 2',
        'TOPIK II 듣기 모의고사 2회',
        '50 soal menyimak dengan format TOPIK II.',
        'TOPIK II 형식의 듣기 50문항입니다.',
        3600, 50, 100, 4, FALSE
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
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO topik_app.mock_test_sections(
    mock_test_id, section_order, section, set_id, set_version
) VALUES
    (
        '10000000-0000-4000-8000-000000000003', 1, 'listening',
        '3ffc10a1-db41-5718-b479-60224edec836', 1
    ),
    (
        '10000000-0000-4000-8000-000000000004', 1, 'listening',
        'c5e3af83-93d5-5bef-a2e7-5186ee358f9c', 1
    )
ON CONFLICT (mock_test_id, section_order) DO UPDATE SET
    section = EXCLUDED.section,
    set_id = EXCLUDED.set_id,
    set_version = EXCLUDED.set_version;
