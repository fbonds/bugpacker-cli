/**
 * Comparing two captures.
 *
 * The package format is not uniformly structured, and this command's whole honesty rests
 * on not pretending otherwise. Some sections compare fields; some can only compare lines
 * of text that were laid out for a person to read. Both appear here, and which one you
 * got is stated rather than left to be inferred from how confident the output looks.
 *
 * The rule that makes that survive a format change: **a section's kind is resolved at
 * runtime from what the package actually carries, and is never written as a literal.**
 * The console is the live case. Today `report.json` records console errors as system
 * steps and nothing else, so the rest of the console resolves to `console.log` and the
 * section says "text". If `report.json` ever grows a console array, the same resolver
 * finds it, the section says "structured", and nothing here is edited to make that
 * happen. Nothing is built in anticipation of that array either. A test asserts the flip
 * by feeding in a package that has one.
 */

import type { BugPackage } from '../package.js'

export type Kind = 'structured' | 'text'

export interface Section {
  title: string
  /** Resolved from the package. Never a constant. */
  kind: Kind
  /** Which file or field the comparison read. */
  source: string
  /** One line per difference. Empty means nothing changed. */
  lines: string[]
  /** A caveat that belongs with the section rather than the whole report. */
  note?: string
}

/**
 * The leading offset the extension writes on every rendered log line. Two captures of
 * the same condition are never keystroke-identical in time, so comparing raw lines
 * reports every line as changed. Stripping a fixed, documented prefix is normalisation
 * for comparison; it is not a second rendering of the data.
 */
const LOG_OFFSET = /^\[\+\d+:\d+\.\d+\]\s*/

/** What redaction leaves where a query string used to be. See the network section. */
const REDACTED_QUERY = /\?…\s*\((\d+)\s+parameters?\s+removed\)/

/**
 * Long enough for a selector, a URL or a box, short enough that a computed style or a
 * snippet of outerHTML does not take the line off the screen. Truncation is marked,
 * because a difference you cannot see the whole of is still a difference and the reader
 * should know how much is missing.
 *
 * Both numbers in the marker count the rendered JSON, which is the thing being cut, and
 * the wording says "shown" so they cannot be read as a measurement of the value. They are
 * not the same number: an outerHTML of 485 characters renders as 524 once quoted and
 * escaped. Reporting the larger one as the length of the value would be a derived claim
 * that is wrong in the direction that looks right.
 */
const VALUE_WIDTH = 96

function json(value: unknown): string {
  if (value === undefined) return '(absent)'
  const text = JSON.stringify(value) ?? String(value)
  return text.length <= VALUE_WIDTH
    ? text
    : `${text.slice(0, VALUE_WIDTH)}... (${VALUE_WIDTH} of ${text.length} shown)`
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Differences between two objects, by key.
 *
 * Recurses one level into nested objects so that a changed computed style reports the
 * properties that changed rather than both style blocks in full. One level only: deeper
 * than that and the key paths cost more attention than they save.
 */
function diffObject(a: Record<string, unknown>, b: Record<string, unknown>, depth = 1): string[] {
  const out: string[] = []
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const left = a[key]
    const right = b[key]
    if (JSON.stringify(left) === JSON.stringify(right)) continue
    if (depth > 0 && isPlainObject(left) && isPlainObject(right)) {
      for (const line of diffObject(left, right, depth - 1)) out.push(`${key}.${line}`)
      continue
    }
    out.push(`${key}: ${json(left)}  ->  ${json(right)}`)
  }
  return out
}

/** Lines present on one side and not the other, after normalising the log offset. */
function diffLines(before: string | undefined, after: string | undefined): string[] {
  if (before === undefined && after === undefined) return []
  const split = (text: string | undefined): string[] =>
    (text ?? '').split('\n').map((l) => l.replace(LOG_OFFSET, '')).filter((l) => l.trim() !== '')
  const left = split(before)
  const right = split(after)
  const counts = new Map<string, number>()
  for (const line of left) counts.set(line, (counts.get(line) ?? 0) + 1)
  const added: string[] = []
  for (const line of right) {
    const n = counts.get(line) ?? 0
    if (n > 0) counts.set(line, n - 1)
    else added.push(line)
  }
  const removed: string[] = []
  for (const [line, n] of counts) for (let i = 0; i < n; i++) removed.push(line)
  return [...removed.map((l) => `- ${l}`), ...added.map((l) => `+ ${l}`)]
}

const readJson = (pkg: BugPackage, name: string): Record<string, unknown> | undefined => {
  const text = pkg.readText(name)
  if (text === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/**
 * The console, resolved rather than assumed.
 *
 * Returns entries when the report carries a structured console, and undefined when it
 * does not. Nothing else in this file knows which of those is true today.
 */
function structuredConsole(pkg: BugPackage): unknown[] | undefined {
  const value = (pkg.report as unknown as Record<string, unknown>).console
  return Array.isArray(value) ? value : undefined
}

function consoleOutput(a: BugPackage, b: BugPackage): Section {
  const left = structuredConsole(a)
  const right = structuredConsole(b)
  if (left && right) {
    return {
      title: 'Console output',
      kind: 'structured',
      source: 'report.json console[]',
      lines: diffLines(
        left.map((e) => JSON.stringify(e)).join('\n'),
        right.map((e) => JSON.stringify(e)).join('\n'),
      ),
    }
  }
  return {
    title: 'Console output',
    kind: 'text',
    source: 'console.log',
    note:
      'report.json records console errors as steps and records nothing else from the ' +
      'console, so warnings, log lines and CSP violations exist only in this rendering. ' +
      'A changed line is all that can be said about them; whether one is new, or the same ' +
      'one reworded, is not in the package. Timestamps are ignored when comparing.',
    lines: diffLines(a.readText('console.log'), b.readText('console.log')),
  }
}

/** Method plus origin and path. The query is deliberately not part of this; see the note. */
function requestKey(url: string, method: string): string {
  const withoutQuery = url.split('?')[0] ?? url
  return `${method} ${withoutQuery}`
}

function redactedParams(url: string): number | undefined {
  const match = REDACTED_QUERY.exec(url)
  return match ? Number(match[1]) : undefined
}

interface HarEntry {
  request: { url: string; method: string }
  response: { status: number }
  _bugpacker?: { ok?: boolean }
}

function harEntries(pkg: BugPackage): HarEntry[] {
  const text = pkg.readText('network.har')
  if (text === undefined) return []
  try {
    const parsed = JSON.parse(text) as { log?: { entries?: HarEntry[] } }
    return parsed.log?.entries ?? []
  } catch {
    return []
  }
}

function network(a: BugPackage, b: BugPackage): Section {
  const index = (entries: HarEntry[]): Map<string, HarEntry> => {
    const map = new Map<string, HarEntry>()
    for (const e of entries) map.set(requestKey(e.request.url, e.request.method), e)
    return map
  }
  const left = index(harEntries(a))
  const right = index(harEntries(b))
  const lines: string[] = []
  for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const before = left.get(key)
    const after = right.get(key)
    if (!before) {
      lines.push(`+ ${key}  status ${after?.response.status}`)
      continue
    }
    if (!after) {
      lines.push(`- ${key}  status ${before.response.status}`)
      continue
    }
    if (before.response.status !== after.response.status) {
      lines.push(`~ ${key}  status ${before.response.status} -> ${after.response.status}`)
    }
    const okBefore = before._bugpacker?.ok
    const okAfter = after._bugpacker?.ok
    if (okBefore !== okAfter) {
      lines.push(`~ ${key}  reached a server: ${json(okBefore)} -> ${json(okAfter)}`)
    }
    // A changed count means the query changed, even though what changed is unreadable.
    // Suppressing it would hide a real difference behind an artifact of the thing that
    // made it unreadable.
    const paramsBefore = redactedParams(before.request.url)
    const paramsAfter = redactedParams(after.request.url)
    if (paramsBefore !== paramsAfter) {
      lines.push(
        `~ ${key}  redacted query parameters: ${json(paramsBefore)} -> ${json(paramsAfter)}`,
      )
    }
  }
  return {
    title: 'Network',
    kind: 'structured',
    source: 'network.har',
    note:
      'Requests are matched on method, origin and path, with the query string excluded. ' +
      'That is looser than it looks, and it is a consequence of the format rather than a ' +
      'shortcut here: redaction replaces a scrubbed query with a placeholder that records ' +
      'only how many parameters it removed. The query is therefore not a stable key, and ' +
      'nothing in this tool can make it one. Two requests to the same path that ' +
      'differed only in their query are matched together. A change in the number of ' +
      'removed parameters is reported, because it means the query changed even though ' +
      'what changed is not in the package.',
    lines,
  }
}

function subresourceFailures(a: BugPackage, b: BugPackage): Section {
  return {
    title: 'Subresource failures',
    kind: 'text',
    source: 'network-errors.log',
    note:
      'Script, img and link load failures never enter the HAR, which is built only from ' +
      'instrumented requests, so this rendering is the only record of them.',
    lines: diffLines(a.readText('network-errors.log'), b.readText('network-errors.log')),
  }
}

const systemSteps = (pkg: BugPackage): string[] =>
  (pkg.report.steps ?? []).filter((s) => s.kind === 'system').map((s) => s.text)

export function diff(a: BugPackage, b: BugPackage): Section[] {
  const sections: Section[] = []

  sections.push({
    title: 'Capture',
    kind: 'structured',
    source: 'report.json',
    lines: diffObject(
      {
        host: a.report.page?.host,
        url: a.report.page?.url,
        tool: a.report.tool?.version,
        schemaVersion: a.report.schemaVersion,
        createdAt: a.report.createdAt,
      },
      {
        host: b.report.page?.host,
        url: b.report.page?.url,
        tool: b.report.tool?.version,
        schemaVersion: b.report.schemaVersion,
        createdAt: b.report.createdAt,
      },
    ),
  })

  sections.push({
    title: 'Environment',
    kind: 'structured',
    source: 'environment.json',
    note:
      'Every difference is listed. Which of them matters is a judgement about your bug ' +
      'and this cannot make it, so nothing here is filtered out as noise.',
    lines: diffObject(readJson(a, 'environment.json') ?? {}, readJson(b, 'environment.json') ?? {}),
  })

  sections.push({
    title: 'Steps',
    kind: 'structured',
    source: 'report.json steps[]',
    note: 'What appeared and disappeared. Not an alignment of the two sequences.',
    lines: diffLines(
      (a.report.steps ?? []).map((s) => s.text).join('\n'),
      (b.report.steps ?? []).map((s) => s.text).join('\n'),
    ),
  })

  sections.push({
    title: 'Console errors',
    kind: 'structured',
    source: 'report.json steps[kind=system]',
    lines: diffLines(systemSteps(a).join('\n'), systemSteps(b).join('\n')),
  })

  sections.push(consoleOutput(a, b))
  sections.push(network(a, b))
  sections.push(subresourceFailures(a, b))

  const invalid = (pkg: BugPackage): string => {
    const state = readJson(pkg, 'form-state.json')
    const list = (state?.invalid as Array<Record<string, unknown>> | undefined) ?? []
    return list.map((f) => `${String(f.selector)} valid=${String(f.valid)}`).join('\n')
  }
  sections.push({
    title: 'Form state',
    kind: 'structured',
    source: 'form-state.json',
    lines: diffLines(invalid(a), invalid(b)),
  })

  sections.push({
    title: 'Marked element',
    kind: 'structured',
    source: 'element.json',
    lines: diffObject(readJson(a, 'element.json') ?? {}, readJson(b, 'element.json') ?? {}),
  })

  sections.push({
    title: 'Counts',
    kind: 'structured',
    source: 'report.json counts',
    lines: diffObject(
      (a.report.counts ?? {}) as Record<string, unknown>,
      (b.report.counts ?? {}) as Record<string, unknown>,
    ),
  })

  sections.push({
    title: 'Files',
    kind: 'structured',
    source: 'report.json files[]',
    lines: diffLines(
      (a.report.files ?? []).map((f) => f.name).join('\n'),
      (b.report.files ?? []).map((f) => f.name).join('\n'),
    ),
  })

  return sections
}

export function renderDiff(a: BugPackage, b: BugPackage, sections: Section[]): string {
  const out: string[] = []
  out.push(`before  ${a.path}`)
  out.push(`after   ${b.path}`)

  const hostA = a.report.page?.host
  const hostB = b.report.page?.host
  if (hostA !== hostB) {
    out.push('')
    out.push(`Note: these are captures of different hosts, ${hostA} and ${hostB}.`)
    out.push('Comparing them is allowed because staging against production is a real thing')
    out.push('to want. Read the rest knowing that.')
  }

  const render = (list: Section[]): void => {
    for (const section of list) {
      out.push('')
      out.push(`  ${section.title}  [${section.kind}, from ${section.source}]`)
      if (section.note) {
        for (const line of wrap(section.note, 84)) out.push(`    ${line}`)
      }
      if (section.lines.length === 0) {
        out.push('    unchanged')
        continue
      }
      for (const line of section.lines) out.push(`    ${line}`)
    }
  }

  const structured = sections.filter((s) => s.kind === 'structured')
  const text = sections.filter((s) => s.kind === 'text')

  out.push('')
  out.push('Compared field by field')
  render(structured)

  if (text.length) {
    out.push('')
    out.push('Compared as text')
    out.push('  These files are rendered for a person to read, so a comparison can only show')
    out.push('  which lines changed. It cannot tell you that a warning is new, only that a')
    out.push('  line is not in the other file.')
    render(text)
  }

  const changed = sections.filter((s) => s.lines.length > 0).length
  out.push('')
  out.push(
    changed === 0
      ? 'No section differs.'
      : `${changed} of ${sections.length} sections differ.`,
  )
  return out.join('\n')
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}
