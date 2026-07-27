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

// Known variation ids from Intelligems (SR price test)
// TBC: update once Jono sends UUIDs from Intelligems
const PRICE_PLUS_10_UUID = "cf87ddf3c939"; // +10% variant
const PRICE_PLUS_25_UUID = "148235ea00c9"; // +25% variant

// ProFlex Rack product ID — only transform lines for this product
const PROFLEX_PRODUCT_ID = "gid://shopify/Product/9734115393821";

/**
 * Round a price to .99
 * e.g. 131.234 -> 131.99, 132.00 -> 132.99
 * @param {number} price
 * @returns {number}
 */
function roundToNinetyNine(price) {
  return Math.floor(price) + 0.99;
}

/**
 * @param {CartTransformRunInput} input
 * @returns {CartTransformRunResult}
 */
export function cartTransformRun(input) {
  // Read igTestGroups cart attribute (written by Intelligems)
  const igValue = input.cart.attribute?.value ?? "";
  const groupIds = igValue.split(",").map((s) => s.trim());

  const isPlus10 = groupIds.includes(PRICE_PLUS_10_UUID);
  const isPlus25 = groupIds.includes(PRICE_PLUS_25_UUID);

  // Fallback: no recognised bucket — don't touch prices
  if (!isPlus10 && !isPlus25) {
    return NO_CHANGES;
  }

  // Multiplier based on bucket
  const multiplier = isPlus25 ? 1.25 : 1.1;

  /** @type {import("../generated/api").CartTransformRunResult["operations"]} */
  const operations = [];

  input.cart.lines.forEach((line) => {
    // Only apply to ProFlex Rack lines
    if (line.merchandise.product?.id !== PROFLEX_PRODUCT_ID) {
      return;
    }

    const basePrice = parseFloat(String(line.cost.amountPerQuantity.amount));
    const newPrice = roundToNinetyNine(basePrice * multiplier);

    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: newPrice.toFixed(2),
            },
          },
        },
      },
    });
  });

  return operations.length ? { operations } : NO_CHANGES;
}
