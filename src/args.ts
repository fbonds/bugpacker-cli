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

/**
 * Which flags each command accepts, and of which kind.
 *
 * Per command rather than global, because global was the same defect this file was written
 * to prevent, one level up. `--json` was added for `validate` and `show --json` then parsed
 * cleanly and did nothing, which is silent acceptance again: the user asked for machine
 * output, got prose, and was told nothing. A command not in this table takes no flags.
 *
 * `values` consume the token after them. `switches` take none. A flag that takes a value has
 * to be declared, because nothing about `--out ./bug` says whether `./bug` belongs to the
 * flag or stands alone.
 */
const ACCEPTS: Record<string, { values?: readonly string[]; switches?: readonly string[] }> = {
  extract: { values: ['out'] },
  validate: { switches: ['json'] },
  network: { switches: ['failed'] },
}

/** Every command that accepts a given flag, for an error message that helps. */
function acceptedBy(name: string): string[] {
  return Object.entries(ACCEPTS)
    .filter(([, spec]) => spec.values?.includes(name) || spec.switches?.includes(name))
    .map(([command]) => command)
}

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
  const accepts = ACCEPTS[command] ?? {}

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] as string
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }

    const body = token.slice(2)
    const eq = body.indexOf('=')
    const name = eq === -1 ? body : body.slice(0, eq)

    if (accepts.switches?.includes(name)) {
      // `--json=true` is a reasonable thing to type and means nothing here. Saying so
      // beats accepting it and ignoring the value.
      if (eq !== -1) throw new Error(`--${name} takes no value.`)
      switches.add(name)
      continue
    }
    if (!accepts.values?.includes(name)) {
      // Naming the command that does take it turns a dead end into a correction. A flag
      // nothing accepts is a typo and gets the shorter message.
      const elsewhere = acceptedBy(name)
      throw new Error(
        elsewhere.length
          ? `${command} does not take --${name}. ${elsewhere.join(' and ')} does.`
          : `Unknown option: ${token}`,
      )
    }
    const value = eq === -1 ? rest[++i] : body.slice(eq + 1)
    // An empty value would fall through to the default and write somewhere the user
    // did not name, which is the silence this whole function exists to remove.
    if (!value) throw new Error(`--${name} needs a value.`)
    flags.set(name, value)
  }

  return { command, positional, flags, switches }
}
