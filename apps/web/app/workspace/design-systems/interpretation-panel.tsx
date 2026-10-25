"use client";

import { useEffect, useState } from "react";
import {
  designSystemInterpretationStatusSchema,
  designSystemInterpretationHistorySchema,
  designSystemInterpretationQueuedSchema,
  type DesignSystemDetail,
} from "@avlp/schemas";
import styles from "./systems.module.css";

type Status = ReturnType<typeof designSystemInterpretationStatusSchema.parse>;
export function DesignInterpretationPanel({
  detail,
  projectId,
  disabled,
  request,
  onAccepted,
  onBusyChange,
}: {
  detail: DesignSystemDetail;
  projectId: string;
  disabled: boolean;
  request: (path: string, method?: string, body?: unknown) => Promise<unknown>;
  onAccepted: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [description, setDescription] = useState("");
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [id, setId] = useState("");
  const [history, setHistory] = useState<
    { id: string; inputRevision: number }[]
  >([]);
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const prefix = `/${detail.system.id}/interpretations`;
  useEffect(() => {
    let active = true;
    void request(prefix)
      .then((data) => {
        const rows = designSystemInterpretationHistorySchema.parse(data);
        if (active) {
          setHistory(rows);
          setId(rows[0]?.id ?? "");
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Interpretation history could not load. Use Refresh interpretation to retry.",
          );
      });
    return () => {
      active = false;
    };
  }, [prefix, request, refresh]);
  useEffect(() => {
    if (!id) {
      setStatus(undefined);
      return;
    }
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = designSystemInterpretationStatusSchema.parse(
          await request(`${prefix}/${id}`),
        );
        if (!active) return;
        setStatus(next);
        if (["queued", "running", "retry_wait"].includes(next.state))
          timer = window.setTimeout(() => {
            void poll();
          }, 2500);
      } catch {
        if (active)
          setError(
            "Interpretation could not refresh. Your saved design is unchanged. Retry using Refresh interpretation.",
          );
      }
    };
    setStatus(undefined);
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [id, prefix, request, refresh, detail.system.revision]);
  const pending =
    status !== undefined &&
    ["queued", "running", "retry_wait"].includes(status.state);
  const stale =
    status?.stale ||
    (status?.inputRevision !== undefined &&
      status.inputRevision !== detail.system.revision &&
      status.acceptedRevision === null);
  return (
    <section
      aria-labelledby="interpret-title"
      className={styles.interpretation}
    >
      <h3 id="interpret-title">Interpret your design language</h3>
      <p>
        Start with a guide, tokens, reference images, or an idea. Review the
        proposed rules before saving them to this system.
      </p>
      {disabled && (
        <p>
          Save or resolve your current edits before requesting or accepting an
          interpretation.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          onBusyChange(true);
          setError("");
          void request(prefix, "POST", {
            projectId,
            expectedRevision: detail.system.revision,
            request: description,
            assetIds,
            paidActionConfirmed: confirmed,
          })
            .then((data) => {
              const queued = designSystemInterpretationQueuedSchema.parse(data);
              setHistory((rows) => [
                { id: queued.id, inputRevision: detail.system.revision },
                ...rows.filter((r) => r.id !== queued.id),
              ]);
              setId(queued.id);
              setConfirmed(false);
            })
            .catch((failure) =>
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Interpretation could not start. Retry shortly.",
              ),
            )
            .finally(() => {
              setBusy(false);
              onBusyChange(false);
            });
        }}
      >
        <fieldset disabled={disabled || busy}>
          <label htmlFor="design-idea">Describe your design language</label>
          <textarea
            id="design-idea"
            required
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <fieldset>
            <legend>Materials to interpret</legend>
            {detail.assets
              .filter((a) => a.status === "active")
              .map((asset) => (
                <label key={asset.id}>
                  <input
                    type="checkbox"
                    checked={assetIds.includes(asset.id)}
                    onChange={(e) =>
                      setAssetIds((ids) =>
                        e.target.checked
                          ? [...ids, asset.id]
                          : ids.filter((id) => id !== asset.id),
                      )
                    }
                  />
                  {asset.originalName} ({asset.kind})
                </label>
              ))}
            <p>
              Select up to twelve validated imports, including at most four
              images. You can also start with your description alone.
            </p>
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            Authorize this paid interpretation (estimated maximum $1.08). Actual
            usage is recorded.
          </label>
          {!projectId && (
            <p>
              Select an owned project in Imports to track this request’s usage.
            </p>
          )}
          <button
            disabled={
              !confirmed || !projectId || pending || assetIds.length > 12
            }
          >
            Generate interpretation
          </button>
        </fieldset>
      </form>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError("");
          setRefresh((n) => n + 1);
        }}
      >
        Refresh interpretation
      </button>
      {history.length > 0 && (
        <label>
          Interpretation history
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {history.map((row, index) => (
              <option key={row.id} value={row.id}>
                Request {history.length - index} · revision {row.inputRevision}
              </option>
            ))}
          </select>
        </label>
      )}
      {status && (
        <div
          role="status"
          aria-live="polite"
        >{`Interpretation ${status.state.replaceAll("_", " ")}${status.acceptedRevision !== null ? " · Accepted" : ""}`}</div>
      )}
      {stale && (
        <p role="alert">
          This interpretation belongs to an older revision. Generate a new
          interpretation of the current design.
        </p>
      )}
      {status?.state === "failed" && (
        <p role="alert">
          {status.errorCode === "DESIGN_DISPATCH_UNCERTAIN"
            ? "The provider dispatch could not be confirmed. Review usage before authorizing another request."
            : "Interpretation failed. Review your materials and usage, then revise your description before generating again."}
        </p>
      )}
      {status?.proposal && (
        <>
          <h4>Proposed brief</h4>
          <p>
            {status.proposal.definition.philosophy || "No philosophy supplied."}
          </p>
          <ul>
            {status.proposal.definition.rules.map((rule) => {
              const provenance = status.proposal!.provenance.find(
                (p) => p.ruleId === rule.id,
              );
              const capability = status.proposal!.capabilities.find(
                (c) => c.ruleId === rule.id,
              );
              return (
                <li key={rule.id}>
                  <strong>
                    {rule.category} · {rule.origin} · {rule.enforcement}
                  </strong>
                  <p>{rule.instruction}</p>
                  {provenance?.quote && (
                    <blockquote>
                      {provenance.quote}
                      <cite>
                        Source:{" "}
                        {provenance.sourceId === "request"
                          ? "Your description"
                          : (detail.assets.find(
                              (a) => a.id === provenance.sourceId,
                            )?.originalName ?? "Supplied material")}
                      </cite>
                    </blockquote>
                  )}
                  <p>
                    {capability?.status}: {capability?.message}
                  </p>
                </li>
              );
            })}
          </ul>
          {status.proposal.conflicts.length > 0 && (
            <>
              <h4>Conflicts to review</h4>
              <ul>
                {status.proposal.conflicts.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </>
          )}
          {status.proposal.unsupported.length > 0 && (
            <>
              <h4>Unsupported requirements</h4>
              <ul>
                {status.proposal.unsupported.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </>
          )}
          {status.proposal.suggestedPresentation && (
            <details>
              <summary>Suggested exact controls for manual review</summary>
              <dl>
                {[
                  [
                    "Heading font",
                    detail.assets.find(
                      (a) =>
                        a.id ===
                        status.proposal!.suggestedPresentation!.fonts.heading,
                    )?.originalName ?? "Unavailable font",
                  ],
                  [
                    "Body font",
                    detail.assets.find(
                      (a) =>
                        a.id ===
                        status.proposal!.suggestedPresentation!.fonts.body,
                    )?.originalName ?? "Unavailable font",
                  ],
                  ...Object.entries(
                    status.proposal.suggestedPresentation.colors,
                  ).map(([role, value]) => [`${role} colour`, value]),
                  ...(
                    [
                      "alignment",
                      "density",
                      "emphasis",
                      "arrangement",
                      "imageFrame",
                      "stroke",
                      "corners",
                    ] as const
                  ).map((key) => [
                    key,
                    status.proposal!.suggestedPresentation![key],
                  ]),
                  [
                    "Motion",
                    `${status.proposal.suggestedPresentation.motion.family}, ${status.proposal.suggestedPresentation.motion.intensity}`,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          <p>
            Acceptance saves a draft. Exact controls and existing rules stay
            intact. Unsupported locks must be resolved before rendering. Edit
            the rules below, then publish a version when ready.
          </p>
          <button
            type="button"
            disabled={
              disabled ||
              busy ||
              stale ||
              status.acceptedRevision !== null ||
              status.state !== "succeeded"
            }
            onClick={() => {
              setBusy(true);
              onBusyChange(true);
              setError("");
              void request(`${prefix}/${id}/accept`, "POST", {
                expectedRevision: detail.system.revision,
              })
                .then(onAccepted)
                .catch((failure) =>
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "The draft could not be accepted. Refresh and review the latest revision.",
                  ),
                )
                .finally(() => {
                  setBusy(false);
                  onBusyChange(false);
                });
            }}
          >
            Accept into design-system draft
          </button>
        </>
      )}
    </section>
  );
}
