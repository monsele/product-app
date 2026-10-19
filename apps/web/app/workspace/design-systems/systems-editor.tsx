"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  customDesignRuleReport,
  customPresentationSchema,
  designSystemDefinitionSchema,
  designSystemDetailSchema,
  designSystemListSchema,
  designSystemUploadResponseSchema,
  projectListPageSchema,
  type CustomPresentation,
  type DesignSystemDefinition,
  type DesignSystemDetail,
} from "@avlp/schemas";
import {
  PageLoading,
  OnionSkinLoader,
} from "../../../components/brand/onion-skin-loader";
import styles from "./systems.module.css";

const api = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/design-systems${path}`;
const initialPresentation: CustomPresentation = {
  colors: {
    background: "#fbf8f3",
    surface: "#ffffff",
    text: "#172033",
    accent: "#5b21b6",
    diagramEmphasis: "#2563eb",
  },
  fonts: { heading: "", body: "" },
  logoAssetId: null,
  alignment: "left",
  density: "spacious",
  emphasis: "text",
  arrangement: "split",
  imageFrame: "none",
  stroke: "fine",
  corners: "square",
  motion: {
    family: "fade",
    prohibited: [],
    intensity: "calm",
    staggerFrames: 0,
    holdFrames: 36,
  },
};
class EditConflict extends Error {}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(api(path), {
    method,
    credentials: "include",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (response.status === 401) {
    window.location.assign("/sign-in");
    throw new Error("Sign in to continue.");
  }
  if (response.status === 409)
    throw new EditConflict(
      "A newer revision exists, or this system was archived. Your unsaved edits are retained below.",
    );
  if (!response.ok)
    throw new Error(
      "The action could not be completed. Check the fields and import status, then retry.",
    );
  return response.json();
}

export function DesignSystemsEditor({
  initialProjectId,
}: {
  initialProjectId?: string | undefined;
}) {
  const [headers, setHeaders] = useState<
    ReturnType<typeof designSystemListSchema.parse>
  >([]);
  const [detail, setDetail] = useState<DesignSystemDetail>();
  const [name, setName] = useState("");
  const [newName, setNewName] = useState("");
  const [definition, setDefinition] = useState<DesignSystemDefinition>({
    schemaVersion: "1.0",
    philosophy: "",
    rules: [],
    assetIds: [],
  });
  const [presentation, setPresentation] =
    useState<CustomPresentation>(initialPresentation);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [kind, setKind] = useState<
    "font" | "guide" | "tokens" | "reference" | "logo"
  >("font");
  const [file, setFile] = useState<File>();
  const [rights, setRights] = useState(false);
  const [historyBefore, setHistoryBefore] = useState<number | null>(null);
  const [history, setHistory] = useState<DesignSystemDetail["versions"]>([]);
  const adopt = useCallback((next: DesignSystemDetail) => {
    setDetail(next);
    setName(next.system.name);
    setDefinition(next.system.definition);
    setPresentation(
      next.system.definition.schemaVersion === "1.1"
        ? next.system.definition.presentation
        : initialPresentation,
    );
    setHistory(next.versions);
    setHistoryBefore(next.nextBeforeRevision);
    setDirty(false);
    setConflict(false);
  }, []);
  const list = useCallback(async () => {
    setHeaders(designSystemListSchema.parse(await request("")));
  }, []);
  useEffect(() => {
    let active = true;
    void list()
      .catch(() => {
        if (active)
          setError("Design systems could not load. Reload the page to retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/projects`,
      { credentials: "include", cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) return;
        const parsed = projectListPageSchema.safeParse(await response.json());
        if (parsed.success && active) setProjects(parsed.data.items);
      })
      .catch(() => {
        /* Imports remain disabled without an owned project. */
      });
    return () => {
      active = false;
    };
  }, [list]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Please retry.");
      if (failure instanceof EditConflict) setConflict(true);
    } finally {
      setBusy(false);
    }
  };
  const open = (id: string) =>
    void act(async () => {
      if (
        dirty &&
        !window.confirm("Discard unsaved edits and open another system?")
      )
        return;
      adopt(designSystemDetailSchema.parse(await request(`/${id}`)));
    });
  const patch = (change: Partial<CustomPresentation>) => {
    setPresentation((current) => ({ ...current, ...change }));
    setDirty(true);
  };
  const editDefinition = (change: Partial<DesignSystemDefinition>) => {
    setDefinition(
      (current) => ({ ...current, ...change }) as DesignSystemDefinition,
    );
    setDirty(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    await act(async () => {
      const settings = customPresentationSchema.safeParse(presentation);
      if (!settings.success)
        throw new Error(
          settings.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(" "),
        );
      const candidate = designSystemDefinitionSchema.safeParse({
        ...definition,
        schemaVersion: "1.1",
        presentation,
      });
      if (!candidate.success)
        throw new Error(
          candidate.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(" "),
        );
      await request(`/${detail.system.id}`, "PUT", {
        expectedRevision: detail.system.revision,
        name,
        definition: candidate.data,
      });
      adopt(
        designSystemDetailSchema.parse(await request(`/${detail.system.id}`)),
      );
      await list();
      setMessage("Revision saved. Existing videos keep their approved design.");
    });
  };
  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !file) return;
    await act(async () => {
      if (!rights || !projectId)
        throw new Error(
          "Choose an owned project and confirm you have rights to use this file.",
        );
      if (file.size > (kind === "font" ? 5 : 10) * 1024 * 1024)
        throw new Error(
          "Choose a file under 5 MB for fonts or 10 MB for other imports.",
        );
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      const types: Record<string, string> = {
        ttf: "font/ttf",
        otf: "font/otf",
        woff2: "font/woff2",
        pdf: "application/pdf",
        md: "text/markdown",
        json: "application/json",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
      };
      const mediaType = types[extension ?? ""];
      if (!mediaType)
        throw new Error(
          "Choose a supported font, PDF, Markdown, JSON, PNG or JPEG file.",
        );
      const bytes = await file.arrayBuffer();
      const sha256 = [
        ...new Uint8Array(
          await globalThis.crypto.subtle.digest("SHA-256", bytes),
        ),
      ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const target = designSystemUploadResponseSchema.parse(
        await request(`/${detail.system.id}/uploads`, "POST", {
          projectId,
          kind,
          mediaType,
          originalName: file.name,
          sizeBytes: file.size,
          sha256,
          rightsConfirmed: true,
        }),
      );
      const put = await fetch(target.upload.url, {
        method: "PUT",
        headers: target.upload.requiredHeaders,
        body: bytes,
      });
      if (!put.ok)
        throw new Error("The upload failed. Choose the file again and retry.");
      await request(
        `/${detail.system.id}/uploads/${target.assetId}/complete`,
        "POST",
      );
      const next = designSystemDetailSchema.parse(
        await request(`/${detail.system.id}`),
      );
      setDetail((current) =>
        current ? { ...current, assets: next.assets } : next,
      );
      setMessage(
        "Import queued for validation. Refresh import status before selecting it.",
      );
    });
  };
  const fonts =
    detail?.assets.filter(
      (asset) => asset.kind === "font" && asset.status === "active",
    ) ?? [];
  const reports = customDesignRuleReport(definition.rules);
  const archived =
    detail?.system.archivedAt !== null &&
    detail?.system.archivedAt !== undefined;
  if (loading) return <PageLoading message="Loading your design systems" />;
  return (
    <section className={styles.page} aria-labelledby="design-system-title">
      <header>
        <Link
          href="/workspace"
          onClick={(event) => {
            if (
              dirty &&
              !window.confirm(
                "Discard unsaved edits and return to the workspace?",
              )
            )
              event.preventDefault();
          }}
        >
          ← Workspace
        </Link>
        <h1 id="design-system-title">My Design Systems</h1>
        <p className={styles.lead}>
          Your fonts, visual rules and rhythm, reusable across lessons.
        </p>
      </header>
      <div role="status" aria-live="polite">
        {busy ? (
          <>
            <OnionSkinLoader /> Saving your changes…
          </>
        ) : (
          message
        )}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {conflict && (
        <div className={styles.recovery}>
          <p>
            Review the latest revision while keeping your local edits, or
            discard them and reload.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                if (!detail) return;
                const latest = designSystemDetailSchema.parse(
                  await request(`/${detail.system.id}`),
                );
                setDetail(latest);
                setConflict(false);
                setMessage(
                  `Latest revision ${latest.system.revision} loaded. Review your local fields before saving over it.`,
                );
              })
            }
          >
            Keep edits and load latest revision
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                if (detail)
                  adopt(
                    designSystemDetailSchema.parse(
                      await request(`/${detail.system.id}`),
                    ),
                  );
              })
            }
          >
            Discard edits and reload
          </button>
        </div>
      )}
      <div className={styles.layout}>
        <aside aria-label="Your design systems">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                if (
                  dirty &&
                  !window.confirm(
                    "Discard unsaved edits and create another system?",
                  )
                )
                  return;
                const created = await request("", "POST", { name: newName });
                const parsed = designSystemListSchema.element.parse(created);
                await list();
                adopt(
                  designSystemDetailSchema.parse(
                    await request(`/${parsed.id}`),
                  ),
                );
                setNewName("");
              });
            }}
          >
            <label htmlFor="new-system">New system name</label>
            <input
              id="new-system"
              required
              maxLength={100}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button disabled={busy}>Create design system</button>
          </form>
          {headers.length === 0 && (
            <p>No systems yet. Create one, then import your fonts.</p>
          )}
          <ul className={styles.systems}>
            {headers.map((system) => (
              <li key={system.id}>
                <button
                  disabled={busy}
                  aria-current={
                    detail?.system.id === system.id ? "true" : undefined
                  }
                  onClick={() => open(system.id)}
                >
                  {system.name}
                  <small>
                    Revision {system.revision}
                    {system.archivedAt ? " · Archived" : ""}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section aria-label="Design system editor" className={styles.editor}>
          {!detail ? (
            <p>Select a system to edit its visual language.</p>
          ) : (
            <>
              <div className={styles.heading}>
                <h2>{detail.system.name}</h2>
                <span>
                  Revision {detail.system.revision}
                  {dirty ? " · Unsaved edits" : ""}
                  {archived ? " · Archived" : ""}
                </span>
              </div>
              <form onSubmit={save}>
                <fieldset disabled={busy || archived || conflict}>
                  <label htmlFor="system-name">Name</label>
                  <input
                    id="system-name"
                    required
                    value={name}
                    maxLength={100}
                    onChange={(event) => {
                      setName(event.target.value);
                      setDirty(true);
                    }}
                  />
                  <label htmlFor="philosophy">Creative philosophy</label>
                  <textarea
                    id="philosophy"
                    rows={3}
                    maxLength={10000}
                    value={definition.philosophy}
                    onChange={(event) =>
                      editDefinition({ philosophy: event.target.value })
                    }
                  />
                  <p className={styles.hint}>
                    Guidance is saved for later interpretation. Exact controls
                    below determine manual rendering.
                  </p>
                  <h3>Typography and colour</h3>
                  <div className={styles.grid}>
                    {(["heading", "body"] as const).map((role) => (
                      <label key={role}>
                        {role === "heading" ? "Heading font" : "Body font"}
                        <select
                          required
                          value={presentation.fonts[role]}
                          onChange={(event) => {
                            const id = event.target.value;
                            patch({
                              fonts: { ...presentation.fonts, [role]: id },
                            });
                            editDefinition({
                              assetIds: [
                                ...new Set([...definition.assetIds, id]),
                              ],
                            });
                          }}
                        >
                          <option value="">Choose a validated font</option>
                          {fonts.map((font) => (
                            <option key={font.id} value={font.id}>
                              {font.originalName}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className={styles.colors}>
                    {(
                      Object.keys(
                        presentation.colors,
                      ) as (keyof CustomPresentation["colors"])[]
                    ).map((role) => (
                      <label key={role}>
                        {role.replace("diagramEmphasis", "Diagram emphasis")}
                        <input
                          aria-label={`${role} colour`}
                          type="color"
                          value={presentation.colors[role]}
                          onChange={(event) =>
                            patch({
                              colors: {
                                ...presentation.colors,
                                [role]: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    Logo
                    <select
                      value={presentation.logoAssetId ?? ""}
                      onChange={(event) => {
                        const id = event.target.value || null;
                        patch({ logoAssetId: id });
                        if (id)
                          editDefinition({
                            assetIds: [
                              ...new Set([...definition.assetIds, id]),
                            ],
                          });
                      }}
                    >
                      <option value="">No logo</option>
                      {detail.assets
                        .filter(
                          (a) => a.kind === "logo" && a.status === "active",
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.originalName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <h3>Exact presentation controls</h3>
                  <p className={styles.hint}>
                    These values are pinned in every published revision.
                  </p>
                  <div className={styles.grid}>
                    {(
                      [
                        ["alignment", ["left", "center"]],
                        ["density", ["spacious", "compact"]],
                        ["emphasis", ["text", "image"]],
                        ["arrangement", ["split", "stacked"]],
                        [
                          "imageFrame",
                          ["none", "rule", "rounded", "paper", "block"],
                        ],
                        ["stroke", ["fine", "bold"]],
                        ["corners", ["square", "rounded"]],
                      ] as const
                    ).map(([key, options]) => (
                      <label key={key}>
                        {key === "arrangement"
                          ? "Comparison arrangement"
                          : key === "imageFrame"
                            ? "Image framing"
                            : key}
                        <select
                          value={presentation[key]}
                          onChange={(event) =>
                            patch({ [key]: event.target.value })
                          }
                        >
                          {options.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <h3>Motion</h3>
                  <div className={styles.grid}>
                    <label>
                      Preferred entrance
                      <select
                        value={presentation.motion.family}
                        onChange={(event) =>
                          patch({
                            motion: {
                              ...presentation.motion,
                              family: event.target.value as "fade" | "settle",
                            },
                          })
                        }
                      >
                        <option>fade</option>
                        <option>settle</option>
                      </select>
                    </label>
                    <label>
                      Intensity
                      <select
                        value={presentation.motion.intensity}
                        onChange={(event) =>
                          patch({
                            motion: {
                              ...presentation.motion,
                              intensity: event.target
                                .value as CustomPresentation["motion"]["intensity"],
                            },
                          })
                        }
                      >
                        <option>calm</option>
                        <option>balanced</option>
                        <option>lively</option>
                      </select>
                    </label>
                    <label>
                      Stagger (frames)
                      <input
                        type="number"
                        min={0}
                        max={12}
                        value={presentation.motion.staggerFrames}
                        onChange={(event) =>
                          patch({
                            motion: {
                              ...presentation.motion,
                              staggerFrames: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Readable hold (frames)
                      <input
                        type="number"
                        min={30}
                        max={90}
                        value={presentation.motion.holdFrames}
                        onChange={(event) =>
                          patch({
                            motion: {
                              ...presentation.motion,
                              holdFrames: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className={styles.row}>
                    {(["fade", "settle"] as const).map((family) => (
                      <label key={family}>
                        <input
                          type="checkbox"
                          checked={presentation.motion.prohibited.includes(
                            family,
                          )}
                          onChange={(event) =>
                            patch({
                              motion: {
                                ...presentation.motion,
                                prohibited: event.target.checked
                                  ? [...presentation.motion.prohibited, family]
                                  : presentation.motion.prohibited.filter(
                                      (value) => value !== family,
                                    ),
                              },
                            })
                          }
                        />
                        Prohibit {family}
                      </label>
                    ))}
                  </div>
                  <h3>Rules and principles</h3>
                  {definition.rules.map((rule, index) => (
                    <div key={rule.id} className={styles.rule}>
                      <label>
                        Rule {index + 1}
                        <textarea
                          required
                          maxLength={1000}
                          value={rule.instruction}
                          onChange={(event) =>
                            editDefinition({
                              rules: definition.rules.map((item) =>
                                item.id === rule.id
                                  ? { ...item, instruction: event.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Enforcement
                        <select
                          value={rule.enforcement}
                          onChange={(event) =>
                            editDefinition({
                              rules: definition.rules.map((item) =>
                                item.id === rule.id
                                  ? {
                                      ...item,
                                      enforcement: event.target.value as
                                        "locked" | "guidance",
                                    }
                                  : item,
                              ),
                            })
                          }
                        >
                          <option value="guidance">Advisory guidance</option>
                          <option value="locked">Exact lock</option>
                        </select>
                      </label>
                      <label>
                        Category
                        <select
                          value={rule.category}
                          onChange={(event) =>
                            editDefinition({
                              rules: definition.rules.map((item) =>
                                item.id === rule.id
                                  ? {
                                      ...item,
                                      category: event.target
                                        .value as typeof rule.category,
                                    }
                                  : item,
                              ),
                            })
                          }
                        >
                          {[
                            "typography",
                            "colour",
                            "composition",
                            "imagery",
                            "diagrams",
                            "motion",
                          ].map((category) => (
                            <option key={category}>{category}</option>
                          ))}
                        </select>
                      </label>
                      <p
                        className={
                          rule.enforcement === "locked"
                            ? styles.error
                            : styles.hint
                        }
                      >
                        {reports[index]?.message}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          editDefinition({
                            rules: definition.rules.filter(
                              (item) => item.id !== rule.id,
                            ),
                          })
                        }
                      >
                        Remove rule {index + 1}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={definition.rules.length >= 100}
                    onClick={() =>
                      editDefinition({
                        rules: [
                          ...definition.rules,
                          {
                            id: globalThis.crypto.randomUUID(),
                            category: "composition",
                            instruction: "",
                            enforcement: "guidance",
                            origin: "supplied",
                          },
                        ],
                      })
                    }
                  >
                    Add principle or requirement
                  </button>
                  <div className={styles.actions}>
                    <button className={styles.primary} disabled={!dirty}>
                      Save revision
                    </button>
                  </div>
                </fieldset>
              </form>
              <details open>
                <summary>Imports and validation</summary>
                <p>
                  Only validated fonts and assets can enter a published
                  revision. Reference guides are stored as data.
                </p>
                <form onSubmit={upload}>
                  <fieldset disabled={busy || archived} className={styles.grid}>
                    <label>
                      Import kind
                      <select
                        value={kind}
                        onChange={(event) =>
                          setKind(event.target.value as typeof kind)
                        }
                      >
                        {["font", "guide", "tokens", "reference", "logo"].map(
                          (value) => (
                            <option key={value}>{value}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Project for import processing
                      <select
                        required
                        value={projectId}
                        onChange={(event) => setProjectId(event.target.value)}
                      >
                        <option value="">Choose your project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      File
                      <input
                        type="file"
                        required
                        accept=".ttf,.otf,.woff2,.pdf,.md,.json,.png,.jpg,.jpeg"
                        onChange={(event) => setFile(event.target.files?.[0])}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        required
                        checked={rights}
                        onChange={(event) => setRights(event.target.checked)}
                      />
                      I have rights to use this file
                    </label>
                    <button disabled={!file || !rights || !projectId}>
                      Import and validate
                    </button>
                  </fieldset>
                </form>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const next = designSystemDetailSchema.parse(
                        await request(`/${detail.system.id}`),
                      );
                      setDetail((current) =>
                        current ? { ...current, assets: next.assets } : next,
                      );
                      setMessage("Import status refreshed.");
                    })
                  }
                >
                  Refresh import status
                </button>
                <ul>
                  {detail.assets.map((asset) => (
                    <li key={asset.id} className={styles.import}>
                      <label>
                        <input
                          type="checkbox"
                          disabled={
                            asset.status !== "active" ||
                            busy ||
                            archived ||
                            Object.values(presentation.fonts).includes(
                              asset.id,
                            ) ||
                            presentation.logoAssetId === asset.id
                          }
                          checked={definition.assetIds.includes(asset.id)}
                          onChange={(event) =>
                            editDefinition({
                              assetIds: event.target.checked
                                ? [...definition.assetIds, asset.id]
                                : definition.assetIds.filter(
                                    (id) => id !== asset.id,
                                  ),
                            })
                          }
                        />
                        {asset.originalName}
                        {Object.values(presentation.fonts).includes(asset.id) ||
                        presentation.logoAssetId === asset.id
                          ? " · In use"
                          : ""}
                      </label>
                      {asset.kind === "tokens" && asset.status === "active" && (
                        <button
                          type="button"
                          disabled={busy || archived}
                          onClick={() => {
                            const parsed = customPresentationSchema.safeParse(
                              asset.inspection.tokens,
                            );
                            if (!parsed.success) {
                              setError(
                                "This JSON does not match the supported presentation controls. Edit its values manually or import a presentation JSON file.",
                              );
                              return;
                            }
                            patch(parsed.data);
                            editDefinition({
                              assetIds: [
                                ...new Set([
                                  ...definition.assetIds,
                                  ...Object.values(parsed.data.fonts),
                                  asset.id,
                                ]),
                              ],
                            });
                            setMessage(
                              "Imported exact presentation values as unsaved edits. Review and save the revision.",
                            );
                          }}
                        >
                          Use token controls
                        </button>
                      )}
                      <span>
                        {asset.status.replaceAll("_", " ")}
                        {asset.recovery ? " · Upload again to retry" : ""}
                        {asset.rejectionCode
                          ? " · Validation rejected this file"
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Published versions</summary>
                <p>
                  Publishing saves this revision for reuse. Applying it to a
                  lesson is a separate step.
                </p>
                <button
                  disabled={busy || archived || dirty}
                  onClick={() =>
                    void act(async () => {
                      await request(`/${detail.system.id}/versions`, "POST", {
                        expectedRevision: detail.system.revision,
                      });
                      const next = designSystemDetailSchema.parse(
                        await request(`/${detail.system.id}`),
                      );
                      setDetail(next);
                      setHistory(next.versions);
                      setHistoryBefore(next.nextBeforeRevision);
                      setMessage(
                        "Published immutable version. Existing lessons are unchanged.",
                      );
                    })
                  }
                >
                  Publish saved revision
                </button>
                <ul>
                  {history.map((version) => (
                    <li key={version.id}>
                      Revision {version.sourceRevision} ·{" "}
                      {version.snapshot.name}
                      <details>
                        <summary>Inspect saved definition</summary>
                        <pre>
                          {JSON.stringify(version.snapshot.definition, null, 2)}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ul>
                {historyBefore && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const next = await request(
                          `/${detail.system.id}/versions?beforeRevision=${historyBefore}&limit=50`,
                        );
                        const parsed = designSystemDetailSchema
                          .pick({ versions: true, nextBeforeRevision: true })
                          .parse(next);
                        setHistory((current) => [
                          ...current,
                          ...parsed.versions,
                        ]);
                        setHistoryBefore(parsed.nextBeforeRevision);
                      })
                    }
                  >
                    Load older versions
                  </button>
                )}
              </details>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
