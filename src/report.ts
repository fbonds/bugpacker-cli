/**
 * The shape of `report.json`, which is the contract this whole tool is built on.
 *
 * Bugpacker publishes the schema at https://bugpacker.com/report.schema.json and ships
 * a copy inside every package, so a consumer behind an egress allowlist can validate a
 * file it was just handed without a network request. These types follow that schema.
 *
 * Deliberately partial. Only what this tool reads is typed, and unknown keys are
 * preserved rather than stripped, because a newer extension writing a field this
 * version has never heard of is a normal thing that must not break anything.
 */

/** The schema version this tool was written against. */
export const KNOWN_SCHEMA_VERSION = 9

export interface ReportTool {
  name: string
  version: string
}

export interface ReportPage {
  url: string
  startUrl: string
  host: string
  path: string
  title: string
}

export interface ReportRecording {
  startedAt: string
  durationMs: number
  navigations: number
  reloadedAtStart: boolean
}

export interface ReportReported {
  title: string
  severity: string
  expected: string
  actual: string
  notes: string
}

export interface ReportStep {
  index: number
  /**
   * Null for `kind: "system"` steps. Those are consequences rather than actions, so
   * they carry no number in the numbered list a person follows to reproduce.
   */
  ordinal: number | null
  kind: string
  text: string
  detail?: string | null
  targetSelector?: string | null
  targetLabel?: string | null
  offsetMs: number
  at: string
  repeats: number
}

export interface ReportFinding {
  code: string
  class: string
  audience: string
  confidence: string
  summary: string
  detail: string
  evidence?: string[]
}

export interface ReportFile {
  name: string
  mime: string
  bytes: number
  sha256: string
  role: string
}

export interface ReportScreenshot {
  file: string
  label: string
  offsetMs: number
}

export interface ReportRedaction {
  total: number
  distinct: number
  byCategory: { category: string; values?: number; occurrences: number }[]
}

export interface Report {
  $schema?: string
  schemaVersion: number
  reportId: string
  tool: ReportTool
  fingerprint: string
  createdAt: string
  page: ReportPage
  recording: ReportRecording
  reported: ReportReported
  findings: ReportFinding[]
  steps: ReportStep[]
  traceIds: string[]
  environment: Record<string, unknown>
  counts?: Record<string, number>
  redaction?: ReportRedaction
  primaryScreenshot?: string | null
  screenshots: ReportScreenshot[]
  files: ReportFile[]
  archive: { fileCount: number; totalUncompressedBytes: number }
  /** Anything a newer extension writes that this version does not know about. */
  [key: string]: unknown
}

/**
 * Enough validation to fail usefully, not a JSON Schema implementation.
 *
 * The point is telling someone that the file they passed is not a Bugpacker package,
 * or is one this version cannot read, instead of throwing on a missing property three
 * frames deep. A full validator would mean shipping ajv and the schema, which is a lot
 * of weight for a better error message; if the format ever gets loose enough to need
 * one, that is the moment to add it.
 */
export function validateReport(value: unknown): asserts value is Report {
  if (typeof value !== 'object' || value === null) {
    throw new Error('report.json is not an object.')
  }
  const report = value as Partial<Report>
  if (typeof report.schemaVersion !== 'number') {
    throw new Error(
      'report.json has no schemaVersion. This does not look like a Bugpacker package.',
    )
  }
  if (report.schemaVersion > KNOWN_SCHEMA_VERSION) {
    throw new Error(
      `This package uses report schema v${report.schemaVersion}; bugpacker-cli understands v${KNOWN_SCHEMA_VERSION}. ` +
        'Update the CLI: npm install -g bugpacker-cli',
    )
  }
  for (const key of ['page', 'recording', 'reported', 'steps', 'files'] as const) {
    if (report[key] === undefined) {
      throw new Error(`report.json is missing "${key}", so the package is incomplete.`)
    }
  }
}
