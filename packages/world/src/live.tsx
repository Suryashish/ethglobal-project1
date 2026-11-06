"use client";
/**
 * Live World ID widgets (IDKit 4.x). Loaded lazily by client.tsx so the mock path never imports IDKit.
 *  - owner  -> IDKitSessionWidget + CredentialRequest("selfie", {signal}); creates a session (arm) or proves the saved one.
 *  - reader -> IDKitRequestWidget + identityCheck({nationality})  (Identity Check is "Preview": World must enable it).
 */
import {
  CredentialRequest, IDKitErrorCodes, IDKitRequestWidget, IDKitSessionWidget, identityCheck,
  type IDKitResult, type IDKitResultSession, type RpContext,
} from "@worldcoin/idkit";
import { ALPHA2_TO_ALPHA3, type WorldKind, type WorldProofEnvelope } from "./types.js";

export type LiveConfig = {
  appId: string;
  environment: "staging" | "production" | "sandbox";
  actionReader: string;
};

export type LiveWidgetProps = {
  kind: WorldKind;
  signal: string;
  rpContext: RpContext;
  config: LiveConfig;
  /** owner: saved session id to prove; omit to create a new session (arming). */
  sessionId?: string;
  /** reader: the nationality (alpha-2) being attested. */
  nationality?: string;
  onResult: (env: WorldProofEnvelope) => Promise<void>;
  onClose: () => void;
  onFail: (message: string) => void;
};

export function friendlyIdkitError(code: string, kind: WorldKind): string {
  switch (code) {
    case IDKitErrorCodes.UserRejected:
    case IDKitErrorCodes.VerificationRejected:
    case IDKitErrorCodes.Cancelled:
      return "Verification cancelled.";
    case IDKitErrorCodes.CredentialUnavailable:
    case IDKitErrorCodes.WorldId4NotAvailable:
    case IDKitErrorCodes.FeatureUnavailable:
      return kind === "owner"
        ? "Selfie Check is not available for this World ID. Open World App, complete Selfie Check, then try again."
        : "No passport credential with a nationality is available for this World ID.";
    case IDKitErrorCodes.IdentityAttributesNotMatched:
      return "Your World ID does not attest that nationality, so this content is not available to you.";
    case IDKitErrorCodes.MaxVerificationsReached:
    case IDKitErrorCodes.NullifierReplayed:
      return "This World ID has already used its allowed verifications for this action.";
    case IDKitErrorCodes.UserPresenceFailed:
      return "The live face check did not complete. Please try again.";
    case IDKitErrorCodes.Timeout:
      return "Verification timed out. Please try again.";
    case IDKitErrorCodes.ConnectionFailed:
      return "Could not reach World App. Check your connection and try again.";
    default:
      return `World ID error: ${code}`;
  }
}

export default function LiveWidget(p: LiveWidgetProps) {
  // The host-side error (server refused the proof) must win over IDKit's generic `failed_by_host_app`.
  let hostError: string | null = null;
  const handle = async (result: IDKitResult | IDKitResultSession) => {
    try {
      await p.onResult({
        mode: "live", kind: p.kind, signal: p.signal, result,
        ...(p.kind === "reader" && p.nationality ? { claim: { nationality: p.nationality } } : {}),
      });
    } catch (e) {
      hostError = e instanceof Error ? e.message : String(e);
      throw e;
    }
  };
  const onError = (code: string) => {
    p.onFail(code === IDKitErrorCodes.FailedByHostApp && hostError ? hostError : friendlyIdkitError(code, p.kind));
    p.onClose();
  };
  const common = {
    open: true,
    onOpenChange: (o: boolean) => { if (!o) p.onClose(); },
    app_id: p.config.appId as `app_${string}`,
    rp_context: p.rpContext,
    environment: p.config.environment,
    handleVerify: handle,
    onSuccess: () => p.onClose(),
    onError,
  };

  if (p.kind === "owner") {
    return (
      <IDKitSessionWidget
        {...common}
        constraints={CredentialRequest("selfie", { signal: p.signal })}
        {...(p.sessionId && /^session_/.test(p.sessionId) ? { existing_session_id: p.sessionId as `session_${string}` } : {})}
      />
    );
  }
  const a3 = ALPHA2_TO_ALPHA3[p.nationality ?? ""] ?? p.nationality ?? "";
  return (
    <IDKitRequestWidget
      {...common}
      action={p.config.actionReader}
      allow_legacy_proofs={false}
      preset={identityCheck({ attributes: [{ type: "nationality", value: a3 }], legacy_signal: p.signal })}
    />
  );
}
