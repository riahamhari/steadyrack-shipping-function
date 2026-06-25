// @ts-check

/**
 * @typedef {import("../generated/api").CartDeliveryOptionsTransformRunInput} CartDeliveryOptionsTransformRunInput
 * @typedef {import("../generated/api").CartDeliveryOptionsTransformRunResult} CartDeliveryOptionsTransformRunResult
 * @typedef {import("../generated/api").Operation} Operation
 */

/**
 * @type {CartDeliveryOptionsTransformRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

/**
 * @param {CartDeliveryOptionsTransformRunInput} input
 * @returns {CartDeliveryOptionsTransformRunResult}
 */
export function cartDeliveryOptionsTransformRun(input) {
  const subtotal = parseFloat(String(input.cart.cost.subtotalAmount.amount));

  // _igTestGroup is already filtered by key in the input query (written by Intelligems)
  const igTestGroup = input.cart.attribute?.value ?? "";

  // Known variation UUIDs from Intelligems
  // Add any additional variant UUIDs once Jono confirms them
  const CONTROL_UUID = "dde38d76";
  const VARIANT_250_UUID = "25e70b40";

  const isControl = igTestGroup.includes(CONTROL_UUID);
  const isVariant250 = igTestGroup.includes(VARIANT_250_UUID);

  // Fallback: if no recognised bucket, don't touch anything
  if (!isControl && !isVariant250) {
    return NO_CHANGES;
  }

  // Threshold based on bucket
  const threshold = isVariant250 ? 250 : 300;

  /** @type {Operation[]} */
  const operations = [];

  input.cart.deliveryGroups.forEach((group, index) => {
    const deliveryOptions = group.deliveryOptions;

    if (index === 0) {
      // Primary fulfillment group — apply threshold logic
      deliveryOptions.forEach((option) => {
        const price = parseFloat(String(option.cost.amount));

        if (subtotal >= threshold) {
          // Qualifies for discounted rate — show $10, hide $20 and $0
          if (price === 20 || price === 0) {
            operations.push({
              deliveryOptionHide: { deliveryOptionHandle: option.handle },
            });
          }
        } else {
          // Standard rate — show $20, hide $10 and $0
          if (price === 10 || price === 0) {
            operations.push({
              deliveryOptionHide: { deliveryOptionHandle: option.handle },
            });
          }
        }
      });
    } else {
      // Secondary fulfillment group (split order) — force $0, hide everything else
      deliveryOptions.forEach((option) => {
        const price = parseFloat(String(option.cost.amount));
        if (price !== 0) {
          operations.push({
            deliveryOptionHide: { deliveryOptionHandle: option.handle },
          });
        }
      });
    }
  });

  return { operations };
}
