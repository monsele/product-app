import React from "react";

export function ContextualInformationRail() {
  return (
    <aside
      aria-label="Workspace Contextual Guidance"
      className="space-y-6 bg-slate-50 border border-slate-200 rounded-xl p-5"
    >
      <div className="space-y-2">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-700">
          Lesson Creation Rules
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          Upload authoritative source material to generate visual, grounded video lessons for your students.
        </p>
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-200">
        <h4 className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
          <svg
            className="w-4 h-4 text-violet-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Supported Sources
        </h4>
        <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li>PDF or Word (.docx) documents</li>
          <li>Maximum 50 pages per document</li>
          <li>Text content & extracted figures preserved</li>
        </ul>
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-200">
        <h4 className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
          <svg
            className="w-4 h-4 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Privacy & Data Safety
        </h4>
        <p className="text-xs text-slate-600 leading-relaxed">
          Your source uploads stay private within your tenant workspace. Uploads are hashed for idempotency and malware validation.
        </p>
      </div>

      <div className="pt-3 border-t border-slate-200 text-xs text-slate-500">
        <p>Need help? Review the product guide or contact your administrator.</p>
      </div>
    </aside>
  );
}
