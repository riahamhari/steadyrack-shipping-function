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

// Pilot scope: SR-014 re-run only serves West Virginia checkouts.
const PILOT_COUNTRY = "US";
const PILOT_PROVINCE = "WV";

/**
 * @param {CartDeliveryOptionsTransformRunInput} input
 * @returns {CartDeliveryOptionsTransformRunResult}
 */
export function cartDeliveryOptionsTransformRun(input) {
  const subtotal = parseFloat(String(input.cart.cost.subtotalAmount.amount));

  // igTestGroups is written by Intelligems as comma-separated 12-char group
  // ids (the last segment of each variation UUID), one per test the visitor
  // is bucketed into.
  const igValue = input.cart.attribute?.value ?? "";
  const groupIds = igValue.split(",").map((s) => s.trim());

  // Known variation ids from Intelligems (SR-014 re-run)
  const FLAT_RATE_250_UUID = "fe3fa32c8484";
  const FREE_SHIP_250_UUID = "0c30e03ac104";

  const isFlatRate250 = groupIds.includes(FLAT_RATE_250_UUID);
  const isFreeShip250 = groupIds.includes(FREE_SHIP_250_UUID);
  // Missing or unrecognised bucket falls back to control behaviour (the
  // store's live thresholds) so an attribute-less session can never see all
  // three unconditioned rates at once.
  const isControl = !isFlatRate250 && !isFreeShip250;

  const threshold = isControl ? 300 : 250;
  const qualifyingRate = isFreeShip250 ? 0 : 10;

  /** @type {Operation[]} */
  const operations = [];

  let paidGroupSeen = false;

  input.cart.deliveryGroups.forEach((group) => {
    // Only touch groups delivering to the pilot region; every other address
    // keeps its native rates.
    const address = group.deliveryAddress;
    if (
      address?.countryCode !== PILOT_COUNTRY ||
      address?.provinceCode !== PILOT_PROVINCE
    ) {
      return;
    }

    const deliveryOptions = group.deliveryOptions;
    /** @type {Operation[]} */
    const groupHides = [];

    if (!paidGroupSeen) {
      paidGroupSeen = true;
      // Paying fulfillment group — apply threshold logic
      deliveryOptions.forEach((option) => {
        const price = parseFloat(String(option.cost.amount));

        if (subtotal >= threshold) {
          // Qualifies — show qualifying rate only, hide everything else
          if (price !== qualifyingRate) {
            groupHides.push({
              deliveryOptionHide: { deliveryOptionHandle: option.handle },
            });
          }
        } else {
          // Below threshold — show $20, hide everything else
          if (price !== 20) {
            groupHides.push({
              deliveryOptionHide: { deliveryOptionHandle: option.handle },
            });
          }
        }
      });
    } else {
      // Additional WV group (split order) — force $0 so the order is only
      // charged shipping once
      deliveryOptions.forEach((option) => {
        const price = parseFloat(String(option.cost.amount));
        if (price !== 0) {
          groupHides.push({
            deliveryOptionHide: { deliveryOptionHandle: option.handle },
          });
        }
      });
    }

    // Fail open: never hide every option in a group. If the expected rate is
    // missing (e.g. zone misconfigured), show the native rates rather than
    // break checkout with zero shipping methods.
    if (groupHides.length < deliveryOptions.length) {
      operations.push(...groupHides);
    }
  });

  return operations.length ? { operations } : NO_CHANGES;
}
