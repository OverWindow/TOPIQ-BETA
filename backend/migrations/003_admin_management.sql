ALTER TABLE topik_app.tts_generation_jobs
    ADD COLUMN IF NOT EXISTS tts_style JSONB NOT NULL DEFAULT
        '{"speakingRate": 1, "stylePrompt": ""}'::jsonb;

ALTER TABLE topik_app.tts_audio_assets
    ADD COLUMN IF NOT EXISTS tts_style JSONB NOT NULL DEFAULT
        '{"speakingRate": 1, "stylePrompt": ""}'::jsonb;

ALTER TABLE topik_app.tts_audio_assets
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS response_observations_created_idx
    ON topik_app.response_observations(created_at DESC);

CREATE INDEX IF NOT EXISTS sessions_started_idx
    ON topik_app.sessions(started_at DESC);
