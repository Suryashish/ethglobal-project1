import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { WorldVerifyButton } from "../src/client.js";

describe("WorldVerifyButton SSR", () => {
  it("renders the button in mock and live mode without touching the DOM", () => {
    for (const mode of ["mock", "live"] as const) {
      const html = renderToString(
        <WorldVerifyButton kind="owner" signal="iigs|arm|s||1" label="Arm with World ID" config={{ mode, appId: "app_x" }} onVerified={() => {}} />,
      );
      expect(html).toContain("Arm with World ID");
    }
  });
  it("live widget module loads (IDKit exports present)", async () => {
    const m = await import("../src/live.js");
    expect(typeof m.default).toBe("function");
    expect(m.friendlyIdkitError("credential_unavailable", "owner")).toMatch(/Selfie Check/);
  });
});
