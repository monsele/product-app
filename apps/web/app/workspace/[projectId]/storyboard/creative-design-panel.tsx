"use client";

import { useCallback, useEffect, useState } from "react";
import {
  creativeDesignManifestSchema,
  creativeDesignPackIds,
  creativeDesignProposalPatchSchema,
  type CreativeDesignPackId,
  type CreativeDesignManifest,
} from "@avlp/schemas";

type Draft = {
  revision: number;
  manifest: CreativeDesignManifest;
  eligibility: readonly string[];
};
type Preset = {
  id: string;
  name: string;
  revision: number;
  versions: readonly { id: string; versionNumber: number }[];
};
type Alternative = { treatmentId: string; description: string };
const api = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;

export function CreativeDesignPanel({
  projectId,
  selectedSceneId,
}: {
  projectId: string;
  selectedSceneId: string | null;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [local, setLocal] = useState<CreativeDesignManifest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pilotAvailable, setPilotAvailable] = useState(true);
  const [presets, setPresets] = useState<readonly Preset[]>([]);
  const [alternatives, setAlternatives] = useState<readonly Alternative[]>([]);
  const load = useCallback(async () => {
    const response = await fetch(
      api(`/projects/${encodeURIComponent(projectId)}/creative-design`),
      { credentials: "include", cache: "no-store" },
    );
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMessage =
        typeof value === "object" &&
        value !== null &&
        "error" in value &&
        typeof (value as { error?: { message?: unknown } }).error?.message ===
          "string"
          ? (value as { error: { message: string } }).error.message
          : "Unable to load creative design.";
      if (response.status === 404 && errorMessage.includes("not enabled"))
        setPilotAvailable(false);
      throw new Error(errorMessage);
    }
    setPilotAvailable(true);
    if (value === null) {
      setDraft(null);
      setLocal(null);
      return;
    }
    const parsed = value as {
      revision?: unknown;
      manifest?: unknown;
      eligibility?: unknown;
    };
    const manifest = creativeDesignManifestSchema.safeParse(parsed.manifest);
    if (
      !manifest.success ||
      typeof parsed.revision !== "number" ||
      !Array.isArray(parsed.eligibility)
    )
      throw new Error("The saved creative design is invalid.");
    const next = {
      revision: parsed.revision,
      manifest: manifest.data,
      eligibility: parsed.eligibility.filter(
        (item): item is string => typeof item === "string",
      ),
    };
    setDraft(next);
    setLocal(next.manifest);
  }, [projectId]);
  useEffect(() => {
    void load().catch((error: unknown) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load creative design.",
      ),
    );
  }, [load]);
  const loadPresets = useCallback(async () => {
    const response = await fetch(
      api(`/projects/${encodeURIComponent(projectId)}/creative-design/presets`),
      { credentials: "include", cache: "no-store" },
    );
    const value: unknown = await response.json().catch(() => []);
    if (response.ok && Array.isArray(value))
      setPresets(
        value.filter(
          (item): item is Preset =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { id?: unknown }).id === "string" &&
            typeof (item as { name?: unknown }).name === "string" &&
            typeof (item as { revision?: unknown }).revision === "number" &&
            Array.isArray((item as { versions?: unknown }).versions),
        ),
      );
  }, [projectId]);
  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);
  const request = async (path: string, body: unknown) => {
    const response = await fetch(
      api(`/projects/${encodeURIComponent(projectId)}/creative-design${path}`),
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        typeof value === "object" &&
          value !== null &&
          "error" in value &&
          typeof (value as { error?: { message?: unknown } }).error?.message ===
            "string"
          ? (value as { error: { message: string } }).error.message
          : "Creative design could not be updated.",
      );
    return value;
  };
  const start = async (packId: CreativeDesignPackId) => {
    setBusy(true);
    setMessage(null);
    try {
      await request("/plan", { packId, expectedRevision: 0 });
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to start creative design.",
      );
    } finally {
      setBusy(false);
    }
  };
  const loadAlternatives = async () => {
    if (selectedSceneId === null || local === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        api(
          `/projects/${encodeURIComponent(projectId)}/creative-design/scenes/${encodeURIComponent(selectedSceneId)}/alternatives`,
        ),
        { credentials: "include" },
      );
      const alternatives: unknown = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(alternatives))
        throw new Error("No alternative layout is available for this scene.");
      const safe = alternatives.filter(
        (item): item is Alternative =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { treatmentId?: unknown }).treatmentId === "string" &&
          typeof (item as { description?: unknown }).description === "string",
      );
      if (safe.length === 0)
        throw new Error("No compatible layout is available for this scene.");
      setAlternatives(safe);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load available layouts.",
      );
    } finally {
      setBusy(false);
    }
  };
  const chooseAlternative = (treatmentId: Alternative["treatmentId"]) => {
    if (selectedSceneId === null || local === null) return;
    setLocal({
      ...local,
      selections: {
        ...local.selections,
        [selectedSceneId]: {
          ...local.selections[selectedSceneId]!,
          treatmentId:
            treatmentId as (typeof local.selections)[string]["treatmentId"],
          locked: true,
        },
      },
    });
    setAlternatives([]);
    setMessage(
      "Layout selected in this unsaved preview. Apply to lesson to save it.",
    );
  };
  const apply = async () => {
    if (draft === null || local === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const save = await fetch(
        api(`/projects/${encodeURIComponent(projectId)}/creative-design`),
        {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedRevision: draft.revision,
            manifest: local,
          }),
        },
      );
      const saved: unknown = await save.json().catch(() => null);
      if (
        !save.ok ||
        typeof saved !== "object" ||
        saved === null ||
        typeof (saved as { revision?: unknown }).revision !== "number"
      )
        throw new Error("Creative-design settings could not be saved.");
      const snapshot = await request("/apply", {
        expectedRevision: (saved as { revision: number }).revision,
      });
      if (typeof snapshot !== "object" || snapshot === null)
        throw new Error("Creative-design settings could not be applied.");
      await load();
      setMessage("Creative design applied as an immutable lesson snapshot.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Creative design could not be applied.",
      );
    } finally {
      setBusy(false);
    }
  };
  const describe = async (requestText: string) => {
    if (draft === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const value = await request("/describe", {
        expectedRevision: draft.revision,
        request: requestText,
      });
      const resolved =
        typeof value === "object" &&
        value !== null &&
        "jobId" in value &&
        typeof (value as { jobId?: unknown }).jobId === "string"
          ? await new Promise<unknown>((resolve, reject) => {
              const jobId = (value as { jobId: string }).jobId;
              let attempts = 0;
              const poll = () => {
                void fetch(
                  api(
                    `/projects/${encodeURIComponent(projectId)}/creative-design/describe/${encodeURIComponent(jobId)}`,
                  ),
                  { credentials: "include", cache: "no-store" },
                )
                  .then(async (response) => {
                    const body: unknown = await response
                      .json()
                      .catch(() => null);
                    if (!response.ok)
                      throw new Error("Style proposal could not be loaded.");
                    if (
                      typeof body === "object" &&
                      body !== null &&
                      "patch" in body
                    )
                      resolve(body);
                    else if (attempts >= 40)
                      reject(
                        new Error(
                          "Style proposal is still processing. Try again shortly.",
                        ),
                      );
                    else {
                      attempts += 1;
                      window.setTimeout(poll, 750);
                    }
                  })
                  .catch(reject);
              };
              poll();
            })
          : value;
      const patch = creativeDesignProposalPatchSchema.safeParse(
        typeof resolved === "object" && resolved !== null
          ? (resolved as { patch?: unknown }).patch
          : undefined,
      );
      if (
        typeof resolved === "object" &&
        resolved !== null &&
        "draftRevision" in resolved &&
        (resolved as { draftRevision?: unknown }).draftRevision !==
          draft.revision
      )
        throw new Error(
          "This proposal is for an older design draft. Review your current settings and try again.",
        );
      if (!patch.success || local === null)
        throw new Error(
          "The description did not produce safe supported changes.",
        );
      setLocal({
        ...local,
        settings: {
          fontPair: patch.data.fontPair ?? local.settings.fontPair,
          logoAssetId: local.settings.logoAssetId,
          motionEnergy: patch.data.motionEnergy ?? local.settings.motionEnergy,
          imageryPreference:
            patch.data.imageryPreference ?? local.settings.imageryPreference,
          captionPreset:
            patch.data.captionPreset ?? local.settings.captionPreset,
          colors: {
            background:
              patch.data.colors?.background ?? local.settings.colors.background,
            surface:
              patch.data.colors?.surface ?? local.settings.colors.surface,
            text: patch.data.colors?.text ?? local.settings.colors.text,
            accent: patch.data.colors?.accent ?? local.settings.colors.accent,
            diagramEmphasis:
              patch.data.colors?.diagramEmphasis ??
              local.settings.colors.diagramEmphasis,
          },
        },
      });
      setMessage(
        "Supported changes are shown in the unsaved preview. Review, then Apply to lesson.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Describe changes is unavailable; manual controls remain available.",
      );
    } finally {
      setBusy(false);
    }
  };
  const saveAsPersonalStyle = async () => {
    if (local === null) return;
    const name = window
      .prompt("Name this personal style (up to 80 characters)")
      ?.trim();
    if (!name) return;
    setBusy(true);
    try {
      await request("/presets", { name, manifest: local });
      await loadPresets();
      setMessage("Saved a new immutable version of your personal style.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save personal style.",
      );
    } finally {
      setBusy(false);
    }
  };
  const applyPersonalStyle = async (preset: Preset) => {
    if (draft === null) return;
    setBusy(true);
    try {
      await request(`/presets/${encodeURIComponent(preset.id)}/apply`, {
        expectedRevision: draft.revision,
      });
      await load();
      setMessage(`Applied ${preset.name} as an unsaved design draft.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to apply personal style.",
      );
    } finally {
      setBusy(false);
    }
  };
  const archivePersonalStyle = async (preset: Preset) => {
    if (
      !window.confirm(
        `Archive ${preset.name}? Its saved versions will remain attached to lessons that already use them.`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(
        api(
          `/projects/${encodeURIComponent(projectId)}/creative-design/presets/${encodeURIComponent(preset.id)}`,
        ),
        {
          method: "DELETE",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedRevision: preset.revision }),
        },
      );
      if (!response.ok)
        throw new Error("Personal style could not be archived.");
      await loadPresets();
      setMessage(
        `Archived ${preset.name}. Existing lesson snapshots are unchanged.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Personal style could not be archived.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!pilotAvailable) return null;
  if (draft === null || local === null)
    return (
      <section
        aria-label="Creative design"
        style={{
          borderTop: "1px solid #d7dce5",
          marginTop: 16,
          paddingTop: 16,
        }}
      >
        <h3>Creative design pilot</h3>
        <p>
          Choose a style only when every scene in this lesson is supported.
          Existing lessons keep their saved appearance.
        </p>
        {creativeDesignPackIds.map((pack) => (
          <button
            key={pack}
            type="button"
            disabled={busy}
            onClick={() => void start(pack)}
            style={{ marginRight: 8 }}
          >{`Start ${pack}`}</button>
        ))}
        {message ? <p role="alert">{message}</p> : null}
      </section>
    );
  return (
    <section
      aria-label="Creative design"
      style={{ borderTop: "1px solid #d7dce5", marginTop: 16, paddingTop: 16 }}
    >
      <h3>Creative design pilot</h3>
      {draft.eligibility.length > 0 ? (
        <p role="alert">{draft.eligibility.join(" ")}</p>
      ) : (
        <p>
          Preview changes on your own selected scene, then apply them to the
          whole supported lesson.
        </p>
      )}
      <label>
        Font pair{" "}
        <select
          value={local.settings.fontPair}
          disabled={busy}
          onChange={(event) =>
            setLocal({
              ...local,
              settings: {
                ...local.settings,
                fontPair: event.target
                  .value as CreativeDesignManifest["settings"]["fontPair"],
              },
            })
          }
        >
          <option value="atkinson-inter">Atkinson + Inter</option>
          <option value="source-serif-inter">Source Serif + Inter</option>
          <option value="nunito-inter">Nunito + Inter</option>
        </select>
      </label>
      <label>
        Imagery preference{" "}
        <select
          value={local.settings.imageryPreference}
          disabled={busy}
          onChange={(event) =>
            setLocal({
              ...local,
              settings: {
                ...local.settings,
                imageryPreference: event.target
                  .value as CreativeDesignManifest["settings"]["imageryPreference"],
              },
            })
          }
        >
          <option value="compatible_mix">Compatible mix</option>
          <option value="photography">Photography</option>
          <option value="illustration">Illustration</option>
          <option value="diagrams">Diagrams</option>
        </select>
      </label>
      <fieldset disabled={busy}>
        <legend>Accessible colors</legend>
        {(
          Object.keys(local.settings.colors) as Array<
            keyof CreativeDesignManifest["settings"]["colors"]
          >
        ).map((key) => (
          <label key={key} style={{ marginRight: 8 }}>
            {key}{" "}
            <input
              aria-label={`${key} color`}
              type="color"
              value={local.settings.colors[key]}
              onChange={(event) =>
                setLocal({
                  ...local,
                  settings: {
                    ...local.settings,
                    colors: {
                      ...local.settings.colors,
                      [key]: event.target.value,
                    },
                  },
                })
              }
            />
          </label>
        ))}
      </fieldset>
      <label>
        Approved logo asset ID (optional){" "}
        <input
          value={local.settings.logoAssetId ?? ""}
          disabled={busy}
          onChange={(event) =>
            setLocal({
              ...local,
              settings: {
                ...local.settings,
                logoAssetId: event.target.value.trim() || null,
              },
            })
          }
        />
      </label>
      <div
        aria-label="Creative design preview"
        style={{
          background: local.settings.colors.background,
          border: `2px solid ${local.settings.colors.accent}`,
          color: local.settings.colors.text,
          margin: "12px 0",
          padding: 12,
        }}
      >
        <strong>Own-content treatment preview</strong>
        <p
          style={{
            background: local.settings.colors.surface,
            margin: "8px 0 0",
            padding: 8,
          }}
        >
          {selectedSceneId === null
            ? "Select a storyboard scene to preview its treatment."
            : `Selected scene ${selectedSceneId} uses ${local.selections[selectedSceneId]?.treatmentId ?? "its resolved treatment"}.`}
        </p>
      </div>
      <label>
        Motion energy{" "}
        <select
          value={local.settings.motionEnergy}
          disabled={busy}
          onChange={(event) =>
            setLocal({
              ...local,
              settings: {
                ...local.settings,
                motionEnergy: event.target
                  .value as CreativeDesignManifest["settings"]["motionEnergy"],
              },
            })
          }
        >
          <option value="calm">Calm</option>
          <option value="balanced">Balanced</option>
          <option value="lively">Lively</option>
        </select>
      </label>
      <label>
        Caption treatment{" "}
        <select
          value={local.settings.captionPreset}
          disabled={busy}
          onChange={(event) =>
            setLocal({
              ...local,
              settings: {
                ...local.settings,
                captionPreset: event.target
                  .value as CreativeDesignManifest["settings"]["captionPreset"],
              },
            })
          }
        >
          <option value="standard">Standard</option>
          <option value="high_contrast">High contrast</option>
          <option value="large">Large</option>
        </select>
      </label>
      {selectedSceneId !== null ? (
        <button
          type="button"
          disabled={busy || draft.eligibility.length > 0}
          onClick={() => void loadAlternatives()}
        >
          Choose a layout
        </button>
      ) : null}
      {alternatives.length > 0 ? (
        <div aria-label="Compatible layouts">
          <p>Compatible layouts for the selected scene</p>
          {alternatives.map((alternative) => (
            <button
              key={alternative.treatmentId}
              type="button"
              disabled={busy}
              onClick={() => chooseAlternative(alternative.treatmentId)}
            >
              {alternative.description}
            </button>
          ))}
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const value = form.get("request");
          if (typeof value === "string" && value.trim()) void describe(value);
        }}
      >
        <label>
          Describe the changes{" "}
          <input
            name="request"
            maxLength={1000}
            disabled={busy}
            placeholder="Make this calmer with forest-green accents"
          />
        </label>
        <button type="submit" disabled={busy}>
          Propose changes
        </button>
      </form>
      <button
        type="button"
        disabled={busy || draft.eligibility.length > 0}
        onClick={() => void apply()}
      >
        Apply to lesson
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void saveAsPersonalStyle()}
      >
        Save as personal style
      </button>
      {presets.length > 0 ? (
        <div aria-label="Saved personal styles">
          <p>Saved personal styles</p>
          {presets.map((preset) => (
            <span key={preset.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyPersonalStyle(preset)}
              >
                {`Use ${preset.name} (v${preset.versions[0]?.versionNumber ?? 0})`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void archivePersonalStyle(preset)}
              >
                {`Archive ${preset.name}`}
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => setLocal(draft.manifest)}
      >
        Cancel
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
