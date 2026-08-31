export const TIME_DECIMAL_PLACES = 3

const SCALE = 1000
const DECIMAL_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?$/

// "down" rounds toward negative infinity, "up" toward positive infinity, so
// -0.0035 rounds up to -0.003 and down to -0.004.
export type RoundingMode = "down" | "up"

// Times arrive as decimal strings and are rounded as strings, because scaling
// by 1000 in binary floating point misplaces values that look exact: 1.005 *
// 1000 is 1004.9999999999999, which would floor to 1.004. Working on the
// digits keeps every result exact. Returns thousandths (7.123 -> 7123), or
// null when the text is blank or not a decimal number.
export function roundToThousandths(raw: string, mode: RoundingMode): number | null {
  const match = DECIMAL_PATTERN.exec(raw.trim())
  if (!match) {
    return null
  }

  const [, sign, wholeDigits, fractionDigits = ""] = match
  if (!wholeDigits && !fractionDigits) {
    return null
  }

  // Beyond this the thousandths no longer fit exactly in a Number, and no
  // real run time comes close.
  if (wholeDigits.length > 12) {
    return null
  }

  const negative = sign === "-"
  const kept = fractionDigits.slice(0, TIME_DECIMAL_PLACES).padEnd(TIME_DECIMAL_PLACES, "0")
  const dropped = fractionDigits.slice(TIME_DECIMAL_PLACES)
  const magnitude = Number(`${wholeDigits || "0"}${kept}`)
  const truncated = negative ? -magnitude : magnitude

  // Dropping digits always moves a value toward zero, so it only needs a
  // nudge when the requested direction is the other way.
  if (!/[1-9]/.test(dropped)) {
    return truncated
  }

  if (mode === "down" && negative) {
    return truncated - 1
  }

  if (mode === "up" && !negative) {
    return truncated + 1
  }

  return truncated
}

export function formatThousandths(value: number) {
  const magnitude = Math.abs(value)
  const whole = Math.floor(magnitude / SCALE)
  const fraction = String(magnitude % SCALE).padStart(TIME_DECIMAL_PLACES, "0")

  return `${value < 0 ? "-" : ""}${whole}.${fraction}`
}

export type HudzellCalculation = {
  finish: number | null
  pain: number | null
  final: number | null
}

// The finish time rounds down and the pain rounds up, so the final time is
// never flattered by rounding. A blank pain field counts as zero, which keeps
// the calculator useful the moment a finish time is typed; a blank or
// malformed finish time yields no result at all.
export function calculateFinalTime(finishInput: string, painInput: string): HudzellCalculation {
  const finish = roundToThousandths(finishInput, "down")
  const pain = painInput.trim() === "" ? 0 : roundToThousandths(painInput, "up")

  return {
    finish,
    pain,
    final: finish === null || pain === null ? null : finish - pain,
  }
}
