/**
 * The command line, parsed once and properly.
 *
 * This exists because the first version filtered flags out of the positionals by
 * dropping any token starting with `--`, which removes the flag but leaves its value
 * behind. `extract pkg.zip --out ./bug` then read `./bug` as the name of an artifact
 * and failed on the form the README documents. Worse, `--out=./bug` was dropped as a
 * flag and never matched the lookup for `--out`, so the default of `.` applied and the
 * files landed in the current directory with no error at all.
 *
 * A flag that takes a value has to be declared, because nothing about `--out ./bug`
 * says whether `./bug` belongs to the flag or stands alone. Hence VALUE_FLAGS.
 *
 * Unknown flags are refused rather than ignored. A typo like `--ou ./bug` would
 * otherwise leave `./bug` in the positionals and reintroduce exactly the bug above,
 * silently, which is the failure mode worth spending an error message on.
 */

/** Flags that consume the token after them. */
const VALUE_FLAGS = new Set(['out'])

/** Flags that take no value. Declared for the same reason VALUE_FLAGS is: so that an
 * unknown flag is refused rather than quietly reinterpreted as something else. */
const SWITCHES = new Set(['json'])

export interface Args {
  command: string
  /** Operands, in order, with no flag or flag value among them. */
  positional: string[]
  /** Flag values by name, without the leading dashes. */
  flags: Map<string, string>
  /** Bare switches that were given, without the leading dashes. */
  switches: Set<string>
}

export function parseArgs(argv: string[]): Args {
  const [command = '', ...rest] = argv
  const positional: string[] = []
  const flags = new Map<string, string>()
  const switches = new Set<string>()

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] as string
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }

    const body = token.slice(2)
    const eq = body.indexOf('=')
    const name = eq === -1 ? body : body.slice(0, eq)

    if (SWITCHES.has(name)) {
      // `--json=true` is a reasonable thing to type and means nothing here. Saying so
      // beats accepting it and ignoring the value.
      if (eq !== -1) throw new Error(`--${name} takes no value.`)
      switches.add(name)
      continue
    }
    if (!VALUE_FLAGS.has(name)) {
      throw new Error(`Unknown option: ${token}`)
    }
    const value = eq === -1 ? rest[++i] : body.slice(eq + 1)
    // An empty value would fall through to the default and write somewhere the user
    // did not name, which is the silence this whole function exists to remove.
    if (!value) throw new Error(`--${name} needs a value.`)
    flags.set(name, value)
  }

  return { command, positional, flags, switches }
}
