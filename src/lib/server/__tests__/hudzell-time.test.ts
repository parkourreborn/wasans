import test from "node:test"
import assert from "node:assert/strict"
import {
  calculateFinalTime,
  formatThousandths,
  roundToThousandths,
} from "../../hudzell-time"

function finalTimeOf(finish: string, pain: string) {
  const { final } = calculateFinalTime(finish, pain)
  return final === null ? null : formatThousandths(final)
}

test("a finish time rounds down to three decimals", () => {
  assert.equal(roundToThousandths("7.1234", "down"), 7123)
  assert.equal(roundToThousandths("7.1239", "down"), 7123)
  assert.equal(roundToThousandths("7.123", "down"), 7123)
  assert.equal(roundToThousandths("7", "down"), 7000)
  assert.equal(roundToThousandths("7.1", "down"), 7100)
})

test("hudzell pain rounds up to three decimals, toward positive infinity on both signs", () => {
  assert.equal(roundToThousandths("0.0019", "up"), 2)
  assert.equal(roundToThousandths("0.0011", "up"), 2)
  assert.equal(roundToThousandths("-0.0035", "up"), -3)
  assert.equal(roundToThousandths("-0.0039", "up"), -3)
  assert.equal(roundToThousandths("0.002", "up"), 2)
})

test("rounding down goes the other way on negatives", () => {
  assert.equal(roundToThousandths("-0.0035", "down"), -4)
  assert.equal(roundToThousandths("-7.1234", "down"), -7124)
})

// 1.005 * 1000 is 1004.9999999999999 in binary floating point, so a scale-then
// -floor implementation reports 1.004 here.
test("values that binary floating point misrepresents still round exactly", () => {
  assert.equal(roundToThousandths("1.005", "down"), 1005)
  assert.equal(roundToThousandths("8.115", "down"), 8115)
  assert.equal(roundToThousandths("0.07", "up"), 70)
  assert.equal(roundToThousandths("29.135", "down"), 29135)
})

test("blank and malformed input has no value", () => {
  for (const raw of ["", "   ", ".", "-", "abc", "1.2.3", "1e3", "7,123"]) {
    assert.equal(roundToThousandths(raw, "down"), null, `expected ${JSON.stringify(raw)} to be rejected`)
  }
})

test("thousandths format back to a padded three-decimal string", () => {
  assert.equal(formatThousandths(7123), "7.123")
  assert.equal(formatThousandths(7100), "7.100")
  assert.equal(formatThousandths(2), "0.002")
  assert.equal(formatThousandths(-3), "-0.003")
  assert.equal(formatThousandths(0), "0.000")
})

test("the final time is the rounded-down finish minus the rounded-up pain", () => {
  assert.equal(finalTimeOf("7.1234", "0.0019"), "7.121")
  assert.equal(finalTimeOf("12.9999", "0.5"), "12.499")
  assert.equal(finalTimeOf("7.1234", "-0.0035"), "7.126")
})

test("a blank pain field subtracts nothing", () => {
  assert.equal(finalTimeOf("7.1234", ""), "7.123")
  assert.equal(finalTimeOf("7.1234", "   "), "7.123")
})

test("there is no result until the finish time is a number", () => {
  assert.equal(finalTimeOf("", "0.002"), null)
  assert.equal(finalTimeOf("abc", "0.002"), null)
  assert.equal(finalTimeOf("7.123", "abc"), null)
})

test("a pain larger than the finish time reads as a negative final time", () => {
  assert.equal(finalTimeOf("0.5", "0.75"), "-0.250")
})
