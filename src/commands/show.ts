/**
 * The summary view: what happened, where, and what the capture noticed.
 *
 * Written for a terminal that may be piped, so no colour and no box drawing. The order
 * matters more than the formatting: title and result first, because that is what
 * decides whether the reader keeps going, then the steps, then the findings, then the
 * environment nobody reads until they need it.
 */

import type { BugPackage } from '../package.js'
import type { Report } from '../report.js'

function duration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function section(title: string): string {
  return `\n${title}\n${'-'.repeat(title.length)}`
}

export function show(pkg: BugPackage): string {
  const r: Report = pkg.report
  const out: string[] = []

  out.push(r.reported.title || '(no title)')
  out.push(`${r.reported.severity} · ${r.page.url}`)
  out.push(`recorded ${duration(r.recording.durationMs)} on ${r.createdAt}`)
  out.push(`Bugpacker ${r.tool.version} · report ${r.reportId}`)
  out.push(`fingerprint ${r.fingerprint}  (stable across captures of the same defect)`)

  if (r.reported.expected || r.reported.actual) {
    out.push(section('Result'))
    if (r.reported.expected) out.push(`expected: ${r.reported.expected}`)
    if (r.reported.actual) out.push(`actual:   ${r.reported.actual}`)
  }
  if (r.reported.notes) {
    out.push(section('Notes'))
    out.push(r.reported.notes)
  }

  if (r.steps.length > 0) {
    out.push(section('Steps'))
    for (const step of r.steps) {
      // `text` is already rendered by the extension, selector and repeat count
      // included, so anything appended here is printed twice. Only the numbering is
      // ours: system steps have no ordinal and are indented under the action that
      // produced them, because they are consequences rather than things to redo.
      const lead = step.ordinal === null ? '    ' : `${String(step.ordinal).padStart(2)}. `
      out.push(`${lead}${step.text}`)
    }
  }

  if (r.traceIds.length > 0) {
    out.push(section('Server correlation ids'))
    // Lifted to their own section because this is the shortest path from a bug report
    // to the matching server log, and it is the thing most reports never carry.
    for (const id of r.traceIds) out.push(id)
  }

  if (r.findings.length > 0) {
    out.push(section('Findings'))
    for (const finding of r.findings) {
      out.push(`[${finding.confidence}] ${finding.summary}`)
      if (finding.detail) out.push(`    ${finding.detail}`)
    }
  }

  if (r.counts && Object.keys(r.counts).length > 0) {
    out.push(section('Counts'))
    out.push(
      Object.entries(r.counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(' · '),
    )
  }

  if (r.redaction) {
    out.push(section('Redaction'))
    out.push(
      r.redaction.total === 0
        ? 'Nothing matched the redaction rules.'
        : `${r.redaction.total} replacements, ${r.redaction.distinct} distinct: ` +
            r.redaction.byCategory.map((c) => `${c.occurrences} ${c.category}`).join(', '),
    )
    // Said every time. A reader deciding how far to trust the file needs to know which
    // half of it was machine-checked and which half was not.
    out.push('Applies to what Bugpacker captured. Anything in Unscrubbed-Attachments/ was not.')
  }

  out.push(section('Files'))
  for (const file of r.files) {
    out.push(`${file.name.padEnd(28)} ${String(file.bytes).padStart(9)}  ${file.role}`)
  }
  const extra = pkg.names.filter((n) => !r.files.some((f) => f.name === n))
  for (const name of extra) {
    // report.json and manifest.json cannot carry their own digests, and attachments
    // arrive after the list is built. Shown so the count matches what is in the ZIP.
    out.push(`${name.padEnd(28)} ${''.padStart(9)}  (not digested)`)
  }

  return out.join('\n')
}
