import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import { PublicError, type Identifier } from "@avlp/config";
import type { ReviewTable } from "@avlp/schemas";
import { createApp, sessionCookieName } from "./app.js";
import {
  computeSourceSnapshotHash,
  materializeEffectiveSource,
  type EffectiveSourceInput,
} from "./source-snapshot.js";
import {
  projectEffectiveTableRows,
  projectReviewTable,
  type TableCellCorrectionService,
  type TableCellOverlayState,
} from "./table-cell-corrections.js";

const tableId: Identifier = "019ffbf1-4444-7000-8000-000000000117";
const sectionId: Identifier = "019ffbf1-1111-7000-8000-000000000117";
const columns = ["Metal", "Density (g/cm³)"];
const rows = [
  ["Lithium", "0.53"],
  ["Sodium", "0.97"],
];

describe("projectEffectiveTableRows", () => {
  it("replaces corrected cells and leaves the rest and the input untouched", () => {
    const input = rows.map((row) => [...row]);
    const result = projectEffectiveTableRows(input, [
      { rowIndex: 0, columnIndex: 1, revision: 2, correctedText: "0.534" },
    ]);
    expect(result.rows).toEqual([
      ["Lithium", "0.534"],
      ["Sodium", "0.97"],
    ]);
    expect(result.correctedCells).toEqual([
      { rowIndex: 0, columnIndex: 1, revision: 2 },
    ]);
    expect(input).toEqual(rows);
  });

  it("shows the parser text for a restored overlay", () => {
    const result = projectEffectiveTableRows(rows, [
      { rowIndex: 0, columnIndex: 1, revision: 3, correctedText: null },
    ]);
    expect(result.rows).toEqual(rows);
    expect(result.correctedCells).toEqual([]);
  });

  it("ignores overlays outside the grid", () => {
    const result = projectEffectiveTableRows(rows, [
      { rowIndex: 5, columnIndex: 0, revision: 1, correctedText: "x" },
      { rowIndex: 0, columnIndex: 9, revision: 1, correctedText: "x" },
    ]);
    expect(result.rows).toEqual(rows);
    expect(result.correctedCells).toEqual([]);
  });

  it("lists corrected cells in position order whatever the overlay order", () => {
    const result = projectEffectiveTableRows(rows, [
      { rowIndex: 1, columnIndex: 1, revision: 1, correctedText: "0.968" },
      { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
      { rowIndex: 1, columnIndex: 0, revision: 1, correctedText: "Na" },
    ]);
    expect(
      result.correctedCells.map((cell) => [cell.rowIndex, cell.columnIndex]),
    ).toEqual([
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });
});

describe("projectReviewTable", () => {
  const table = {
    id: tableId,
    order: 1,
    pageStart: 2,
    pageEnd: 2,
    captionBlockId: null,
    columns,
    rows,
    cells: [],
  };

  it("omits cellCorrections for a table that was never corrected", () => {
    expect(projectReviewTable(table, [])).not.toHaveProperty("cellCorrections");
  });

  it("keeps the parser's rows and carries active and restored overlays", () => {
    const review = projectReviewTable(table, [
      { rowIndex: 1, columnIndex: 1, revision: 2, correctedText: null },
      { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
    ]);
    expect(review.rows).toEqual(rows);
    expect(review.cellCorrections).toEqual([
      { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
      { rowIndex: 1, columnIndex: 1, revision: 2, correctedText: null },
    ]);
  });
});

describe("effective-table projection in the approved snapshot", () => {
  function input(
    overlays: readonly TableCellOverlayState[] | undefined,
    included = true,
  ): EffectiveSourceInput {
    return {
      document: {
        id: "019ffbf1-ffff-7000-8000-000000000117",
        sourceDocumentId: "019ffbf1-eeee-7000-8000-000000000117",
        version: 1,
      },
      sections: [
        {
          id: sectionId,
          parentSectionId: null,
          order: 1,
          level: 1,
          heading: "Group 1 metals",
          pageStart: 1,
          pageEnd: 2,
        },
        {
          id: "019ffbf1-1112-7000-8000-000000000117",
          parentSectionId: null,
          order: 2,
          level: 1,
          heading: "Summary",
          pageStart: 3,
          pageEnd: 3,
        },
      ],
      blocks: [],
      figures: [],
      tables: [
        {
          id: tableId,
          sectionId,
          order: 1,
          pageStart: 2,
          pageEnd: 2,
          captionBlockId: null,
          columns,
          rows,
        },
      ],
      overlays: {
        sections: new Map(
          included
            ? []
            : [
                [
                  sectionId,
                  {
                    included: false,
                    displayHeading: null,
                    reviewOrder: null,
                    revision: 1,
                  },
                ],
              ],
        ),
        blocks: new Map(),
        figures: new Map(),
        ...(overlays === undefined
          ? {}
          : { tableCells: new Map([[tableId, overlays]]) }),
      },
    };
  }

  it("snapshots the corrected cell with the table's ID, section and page provenance", () => {
    const content = materializeEffectiveSource(
      input([
        { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
      ]),
    );
    expect(content.tables).toEqual([
      {
        tableId,
        sectionId,
        order: 1,
        pageStart: 2,
        pageEnd: 2,
        columns,
        rows: [
          ["Lithium", "0.534"],
          ["Sodium", "0.97"],
        ],
        correctedCells: [{ rowIndex: 0, columnIndex: 1, revision: 1 }],
      },
    ]);
    expect(content.sections[0]!.tableIds).toEqual([tableId]);
  });

  it("changes the content hash when a cell is corrected", () => {
    const original = computeSourceSnapshotHash(
      materializeEffectiveSource(input(undefined)),
    );
    const corrected = computeSourceSnapshotHash(
      materializeEffectiveSource(
        input([
          { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
        ]),
      ),
    );
    expect(corrected).not.toBe(original);
  });

  it("hashes an uncorrected or fully restored table exactly as before ST-117", () => {
    const before = materializeEffectiveSource(input(undefined));
    expect(before.tables[0]).not.toHaveProperty("correctedCells");
    const original = computeSourceSnapshotHash(before);
    expect(computeSourceSnapshotHash(materializeEffectiveSource(input([])))).toBe(
      original,
    );
    expect(
      computeSourceSnapshotHash(
        materializeEffectiveSource(
          input([
            { rowIndex: 0, columnIndex: 1, revision: 2, correctedText: null },
          ]),
        ),
      ),
    ).toBe(original);
  });

  it("leaves out a corrected table whose section is excluded", () => {
    const content = materializeEffectiveSource(
      input(
        [{ rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" }],
        false,
      ),
    );
    expect(content.tables).toEqual([]);
  });
});

const sampleTable: ReviewTable = {
  id: tableId,
  order: 1,
  pageStart: 2,
  pageEnd: 2,
  columns,
  rows,
  cellCorrections: [
    { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
  ],
};

describe("table cell correction API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<TableCellCorrectionService>) {
    const fixture = createCrossUserProjectFixture();
    const users = new Map<string, AuthenticatedUser>([
      [
        "owner",
        {
          id: fixture.ownerUserId,
          email: "owner@example.test",
          displayName: "Owner",
        },
      ],
      [
        "other",
        {
          id: fixture.otherUserId,
          email: "other@example.test",
          displayName: "Other",
        },
      ],
    ]);
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("Not used");
      },
      signIn: async () => null,
      currentSession: async (token) => users.get(token) ?? null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const tableCellCorrectionService: TableCellCorrectionService = {
      update: vi.fn(async () => sampleTable),
      restore: vi.fn(async () => sampleTable),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      tableCellCorrectionService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      tableCellCorrectionService,
    };
  }

  const headers = {
    origin: "https://teacher.example.test",
    "content-type": "application/json",
  };

  it("corrects a cell for the owner and answers with the review table", async () => {
    const { fixture, server, tableCellCorrectionService } = await api();
    const payload = {
      rowIndex: 0,
      columnIndex: 1,
      revision: 0,
      correctedText: "0.534",
    };
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-tables/${tableId}/cells`,
      cookies: { [sessionCookieName]: "owner" },
      headers,
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(tableCellCorrectionService.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        tableId,
        body: payload,
      }),
    );
    expect(JSON.parse(response.body).cellCorrections[0].correctedText).toBe(
      "0.534",
    );
  });

  it("restores a cell for the owner", async () => {
    const { fixture, server, tableCellCorrectionService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/source-tables/${tableId}/cells/restore`,
      cookies: { [sessionCookieName]: "owner" },
      headers,
      payload: { rowIndex: 0, columnIndex: 1, revision: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(tableCellCorrectionService.restore).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        tableId,
        body: { rowIndex: 0, columnIndex: 1, revision: 1 },
      }),
    );
  });

  it("does not let another teacher correct or restore the table (AC4)", async () => {
    const { fixture, server, tableCellCorrectionService } = await api();
    for (const [method, suffix, payload] of [
      ["PATCH", "", { rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "1" }],
      ["POST", "/restore", { rowIndex: 0, columnIndex: 1, revision: 1 }],
    ] as const) {
      const response = await server.inject({
        method,
        url: `/projects/${fixture.projectId}/source-tables/${tableId}/cells${suffix}`,
        cookies: { [sessionCookieName]: "other" },
        headers,
        payload,
      });
      expect(response.statusCode).toBe(404);
    }
    expect(tableCellCorrectionService.update).not.toHaveBeenCalled();
    expect(tableCellCorrectionService.restore).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-tables/${tableId}/cells`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a request from an untrusted origin", async () => {
    const { fixture, server, tableCellCorrectionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-tables/${tableId}/cells`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://elsewhere.example.test" },
      payload: { rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "1" },
    });
    expect(response.statusCode).toBe(403);
    expect(tableCellCorrectionService.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a malformed table identifier", async () => {
    const { fixture, server, tableCellCorrectionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-tables/not-a-uuid/cells`,
      cookies: { [sessionCookieName]: "owner" },
      headers,
      payload: { rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "1" },
    });
    expect(response.statusCode).toBe(404);
    expect(tableCellCorrectionService.update).not.toHaveBeenCalled();
  });

  it("surfaces a stale-revision conflict as HTTP 409 (AC3)", async () => {
    const { fixture, server } = await api({
      update: vi.fn(async () => {
        throw new PublicError(
          "bad_request",
          "The table cell changed. Please refresh and try again.",
          409,
        );
      }),
    });
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-tables/${tableId}/cells`,
      cookies: { [sessionCookieName]: "owner" },
      headers,
      payload: { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "1" },
    });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.message).toContain("changed");
  });
});
