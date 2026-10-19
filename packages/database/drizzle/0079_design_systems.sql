CREATE TABLE design_systems (
  id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK (revision > 0), definition jsonb NOT NULL,
  archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_systems_owner_id_unique UNIQUE (owner_user_id, id)
);
CREATE INDEX design_systems_owner_idx ON design_systems(owner_user_id, created_at);
--> statement-breakpoint
CREATE TABLE design_system_versions (
  id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, system_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0), snapshot jsonb NOT NULL, content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_user_id, system_id) REFERENCES design_systems(owner_user_id, id) ON DELETE RESTRICT,
  CONSTRAINT design_system_versions_revision_unique UNIQUE (owner_user_id, system_id, source_revision)
);
CREATE TABLE design_system_assets (
  id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, system_id uuid NOT NULL, project_id uuid NOT NULL,
  kind text NOT NULL, media_type text NOT NULL, original_name text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760), sha256 text NOT NULL,
  rights_confirmed_at timestamptz NOT NULL DEFAULT now(),
  upload_key text NOT NULL, storage_key text, validated_sha256 text,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','pending_validation','active','rejected')),
  expires_at timestamptz NOT NULL, job_id uuid, inspection jsonb, rejection_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_user_id, system_id) REFERENCES design_systems(owner_user_id, id) ON DELETE RESTRICT,
  CHECK (status <> 'active' OR (storage_key IS NOT NULL AND validated_sha256 IS NOT NULL AND inspection IS NOT NULL))
);
CREATE INDEX design_system_assets_owner_system_idx ON design_system_assets(owner_user_id, system_id);
--> statement-breakpoint
CREATE FUNCTION protect_published_design_system() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published design-system versions are immutable';
END;
$$;
CREATE TRIGGER design_system_versions_immutable BEFORE UPDATE OR DELETE ON design_system_versions
FOR EACH ROW EXECUTE FUNCTION protect_published_design_system();
--> statement-breakpoint
CREATE FUNCTION protect_validated_design_system_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('active', 'rejected') THEN
    RAISE EXCEPTION 'Validated design-system imports are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER design_system_assets_immutable BEFORE UPDATE OR DELETE ON design_system_assets
FOR EACH ROW EXECUTE FUNCTION protect_validated_design_system_asset();
