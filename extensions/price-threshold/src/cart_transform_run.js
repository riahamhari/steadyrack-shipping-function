// @ts-check
/**
 * @typedef {import("../generated/api").CartTransformRunInput} CartTransformRunInput
 * @typedef {import("../generated/api").CartTransformRunResult} CartTransformRunResult
 */

/**
 * @type {CartTransformRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

// Known variation ids from Intelligems (SR-price test)
const PRICE_PLUS_10_UUID = ""; // TBC from Jono
const PRICE_PLUS_20_UUID = ""; // TBC from Jono

/**
 * @param {CartTransformRunInput} input
 * @returns {CartTransformRunResult}
 */
export function cartTransformRun(input) {
  // Read igTestGroups cart attribute (written by Intelligems)
  const igValue = input.cart.attribute?.value ?? "";
  const groupIds = igValue.split(",").map((s) => s.trim());

  const isPlus10 = groupIds.includes(PRICE_PLUS_10_UUID);
  const isPlus20 = groupIds.includes(PRICE_PLUS_20_UUID);

  // Fallback: no recognised bucket — don't touch prices
  if (!isPlus10 && !isPlus20) {
    return NO_CHANGES;
  }

  // Multiplier based on bucket
  // TBC: confirm rounding rule with Jono (.99, nearest dollar, or raw)
  const multiplier = isPlus20 ? 1.2 : 1.1;

  const operations = input.cart.lines.map((line) => {
    const basePrice = parseFloat(String(line.cost.amountPerQuantity.amount));
    const newPrice = basePrice * multiplier;

    // TODO: apply rounding rule once confirmed
    // Raw for now — update to .99 or nearest dollar based on Jono's answer
    const roundedPrice = Math.round(newPrice * 100) / 100;

    return {
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: roundedPrice.toFixed(2),
            },
          },
        },
      },
    };
  });

  return { operations };
}
