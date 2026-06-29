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
  const CONTROL_UUID = "0f2b5066-2c16-43c8-bf1d-2e75ef7f6c1b";
  const FLAT_RATE_250_UUID = "00721fa1-a158-444e-a5e7-fe3fa32c8484";
  const FREE_SHIP_250_UUID = "b3575eaf-6937-4e94-91ac-0c30e03ac104";

  const isControl = igTestGroup.includes(CONTROL_UUID);
  const isFlatRate250 = igTestGroup.includes(FLAT_RATE_250_UUID);
  const isFreeShip250 = igTestGroup.includes(FREE_SHIP_250_UUID);

  // Fallback: unrecognised bucket — don't touch anything
  if (!isControl && !isFlatRate250 && !isFreeShip250) {
    return NO_CHANGES;
  }

  // Threshold and qualifying rate based on bucket
  const threshold = isControl ? 300 : 250;
  const qualifyingRate = isFreeShip250 ? 0 : 10;

  /** @type {Operation[]} */
  const operations = [];

  input.cart.deliveryGroups.forEach((group, index) => {
    const deliveryOptions = group.deliveryOptions;

    if (index === 0) {
      // Primary fulfillment group — apply threshold logic
      deliveryOptions.forEach((option) => {
        const price = parseFloat(String(option.cost.amount));

        if (subtotal >= threshold) {
          // Qualifies — show qualifying rate only, hide everything else
          if (price !== qualifyingRate) {
            operations.push({
              deliveryOptionHide: { deliveryOptionHandle: option.handle },
            });
          }
        } else {
          // Below threshold — show $20, hide everything else
          if (price !== 20) {
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
