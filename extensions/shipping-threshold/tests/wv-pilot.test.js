import { describe, it, expect } from "vitest";
import { cartDeliveryOptionsTransformRun } from "../src/cart_delivery_options_transform_run.js";

// Short group ids exactly as Intelligems writes them (verified live on
// steadyrack.com cart.js 2026-07-09): comma-separated 12-char tails.
const CONTROL = "2e75ef7f6c1b";
const FLAT_250 = "fe3fa32c8484";
const FREE_250 = "0c30e03ac104";
// Real ids from unrelated concurrently-running tests, as seen live.
const NOISE = "6e6c38f623ed,de82e3c81d69,cee5296605cb";

const WV = { countryCode: "US", provinceCode: "WV" };
const CA_US = { countryCode: "US", provinceCode: "CA" };

// The three unconditioned WV pilot rates as they will exist in the zone.
const wvOptions = () => [
  { handle: "h-free", cost: { amount: "0.0" } },
  { handle: "h-ten", cost: { amount: "10.0" } },
  { handle: "h-twenty", cost: { amount: "20.0" } },
];

// Mirrors the exact input shape observed in production function logs.
function buildInput({ attrValue, subtotal, groups }) {
  return {
    cart: {
      attribute:
        attrValue === null
          ? null
          : { key: "igTestGroups", value: attrValue },
      cost: { subtotalAmount: { amount: String(subtotal) } },
      deliveryGroups: groups.map((g) => ({
        deliveryAddress: g.address,
        deliveryOptions: g.options,
      })),
    },
    deliveryCustomization: { metafield: null },
  };
}

function hiddenHandles(result) {
  return result.operations
    .map((op) => op.deliveryOptionHide?.deliveryOptionHandle)
    .filter(Boolean)
    .sort();
}

describe("WV pilot: bucket x threshold matrix", () => {
  it("control below $300 shows only $20", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: `${NOISE},${CONTROL}`, subtotal: 169.99, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-ten"]);
  });

  it("control at/above $300 shows only $10", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: `${CONTROL},${NOISE}`, subtotal: 350, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-twenty"]);
  });

  it("flat-rate-250 below $250 shows only $20", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: `${NOISE},${FLAT_250}`, subtotal: 169.99, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-ten"]);
  });

  it("flat-rate-250 at $275 shows only $10 (the $250-299 band that used to zero out)", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: `${NOISE},${FLAT_250}`, subtotal: 275, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-twenty"]);
  });

  it("free-ship-250 at $275 shows only free", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: `${FREE_250},${NOISE}`, subtotal: 275, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-ten", "h-twenty"]);
  });

  it("free-ship-250 below $250 shows only $20", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: `${FREE_250}`, subtotal: 200, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-ten"]);
  });

  it("exact boundary $250 qualifies for variant rates", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: FLAT_250, subtotal: 250, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-twenty"]);
  });
});

describe("fallbacks: attribute-less and unknown buckets never see all three rates", () => {
  it("null attribute (Buy-it-Now style) applies control logic below $300", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: null, subtotal: 169.99, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-ten"]);
  });

  it("unknown bucket ids apply control logic above $300", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: NOISE, subtotal: 400, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-twenty"]);
  });

  it("empty attribute value applies control logic", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: "", subtotal: 100, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-ten"]);
  });
});

describe("scope guard: only US groups carrying the full test rate set are touched", () => {
  it("any US state with the $0/$10/$20 signature is in scope (Ohio, flat-250 at $275 shows only $10)", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${NOISE},${FLAT_250}`,
        subtotal: 275,
        groups: [{ address: { countryCode: "US", provinceCode: "OH" }, options: wvOptions() }],
      })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-twenty"]);
  });

  it("a non-US group is untouched even if its rates match the signature", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${FLAT_250}`,
        subtotal: 275,
        groups: [{ address: { countryCode: "CA", provinceCode: "ON" }, options: wvOptions() }],
      })
    );
    expect(r.operations).toEqual([]);
  });

  it("Mainland US variant bucket in the $250-299 band gets NO operations (the checkout-breaker scenario)", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${NOISE},${FLAT_250}`,
        subtotal: 275,
        groups: [{ address: CA_US, options: [{ handle: "h-mainland-20", cost: { amount: "20.0" } }] }],
      })
    );
    expect(r.operations).toEqual([]);
  });

  it("Canadian checkout (real 10:06am log shape: $169.99 cart, single $30 rate) gets NO operations", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${NOISE},${CONTROL}`,
        subtotal: 169.99,
        groups: [
          { address: { countryCode: "CA", provinceCode: "BC" }, options: [{ handle: "h-ca-30", cost: { amount: "30.0" } }] },
        ],
      })
    );
    expect(r.operations).toEqual([]);
  });

  it("missing deliveryAddress is treated as out of pilot scope", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: CONTROL, subtotal: 400, groups: [{ address: null, options: wvOptions() }] })
    );
    expect(r.operations).toEqual([]);
  });
});

describe("split orders: charged once, checkout never empties", () => {
  it("two WV groups: first gets threshold logic, second forced to $0", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${CONTROL}`,
        subtotal: 400,
        groups: [
          { address: WV, options: wvOptions() },
          {
            address: WV,
            options: [
              { handle: "g2-free", cost: { amount: "0.0" } },
              { handle: "g2-ten", cost: { amount: "10.0" } },
              { handle: "g2-twenty", cost: { amount: "20.0" } },
            ],
          },
        ],
      })
    );
    expect(hiddenHandles(r)).toEqual(["g2-ten", "g2-twenty", "h-free", "h-twenty"]);
  });

  it("split across location groups where the second zone lacks the $0 rate: second group left native (config requirement: every test zone needs all three rates)", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${CONTROL}`,
        subtotal: 400,
        groups: [
          { address: WV, options: wvOptions() },
          { address: WV, options: [{ handle: "g2-ten", cost: { amount: "10.0" } }, { handle: "g2-twenty", cost: { amount: "20.0" } }] },
        ],
      })
    );
    // First group filtered to $10; second group has no signature so it is not
    // zeroed. Documents why every US test zone must include the $0 rate.
    expect(hiddenHandles(r)).toEqual(["h-free", "h-twenty"]);
  });

  it("mixed WV + non-WV groups: only the WV group is modified", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${FREE_250}`,
        subtotal: 300,
        groups: [
          { address: CA_US, options: [{ handle: "h-mainland-10", cost: { amount: "10.0" } }] },
          { address: WV, options: wvOptions() },
        ],
      })
    );
    expect(hiddenHandles(r)).toEqual(["h-ten", "h-twenty"]);
  });
});

describe("additive rollout: test rates coexist with the store's original conditioned rates", () => {
  // Go-live is purely additive: the trio is ADDED to a zone whose original
  // conditioned rates stay untouched. The function must show exactly one row.
  const mainlandPlusTrio = (conditionedPrice) => [
    { handle: "orig-conditioned", cost: { amount: conditionedPrice } },
    ...wvOptions(),
  ];

  it("under $300 control: original conditioned $20 coexists with the trio, exactly one $20 shows", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${NOISE},${CONTROL}`,
        subtotal: 169.99,
        groups: [{ address: { countryCode: "US", provinceCode: "OH" }, options: mainlandPlusTrio("20.0") }],
      })
    );
    // keeps the first $20 (orig-conditioned), hides the duplicate + free + ten
    expect(hiddenHandles(r)).toEqual(["h-free", "h-ten", "h-twenty"]);
  });

  it("over $300 control: original conditioned $10 coexists with the trio, exactly one $10 shows", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${CONTROL}`,
        subtotal: 350,
        groups: [{ address: { countryCode: "US", provinceCode: "OH" }, options: mainlandPlusTrio("10.0") }],
      })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-ten", "h-twenty"]);
  });

  it("$250-299 flat-250 bucket: conditioned $20 present, only the $10 shows", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${FLAT_250}`,
        subtotal: 275,
        groups: [{ address: { countryCode: "US", provinceCode: "OH" }, options: mainlandPlusTrio("20.0") }],
      })
    );
    expect(hiddenHandles(r)).toEqual(["h-free", "h-twenty", "orig-conditioned"]);
  });
});

describe("fail-open: never hide every rate in a group", () => {
  it("WV zone missing (today's real config: single conditioned $20 rate) + variant bucket in $250-299 band -> rate stays visible", () => {
    // Without fail-open this hid the only rate and broke checkout.
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${FLAT_250}`,
        subtotal: 275,
        groups: [{ address: WV, options: [{ handle: "h-only-20", cost: { amount: "20.0" } }] }],
      })
    );
    expect(r.operations).toEqual([]);
  });

  it("split group without a $0 rate falls open instead of emptying", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({
        attrValue: `${CONTROL}`,
        subtotal: 400,
        groups: [
          { address: WV, options: wvOptions() },
          { address: WV, options: [{ handle: "g2-twenty", cost: { amount: "20.0" } }] },
        ],
      })
    );
    // Paying group still filtered; second group left alone rather than emptied.
    expect(hiddenHandles(r)).toEqual(["h-free", "h-twenty"]);
  });
});

describe("id matching is exact-token, not substring", () => {
  it("a group id that merely contains a known id as substring does not match", () => {
    // token "x2e75ef7f6c1b" contains the control tail but is a different id
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: `x${CONTROL}`, subtotal: 400, groups: [{ address: WV, options: wvOptions() }] })
    );
    // falls back to control anyway by design, so assert via a variant id instead
    const r2 = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: `x${FREE_250}`, subtotal: 275, groups: [{ address: WV, options: wvOptions() }] })
    );
    // not recognised as free-ship -> control logic below $300 -> only $20 shows
    expect(hiddenHandles(r2)).toEqual(["h-free", "h-ten"]);
    expect(hiddenHandles(r)).toEqual(["h-free", "h-twenty"]);
  });

  it("value with spaces after commas still matches", () => {
    const r = cartDeliveryOptionsTransformRun(
      buildInput({ attrValue: `6e6c38f623ed, ${FREE_250}`, subtotal: 300, groups: [{ address: WV, options: wvOptions() }] })
    );
    expect(hiddenHandles(r)).toEqual(["h-ten", "h-twenty"]);
  });
});
