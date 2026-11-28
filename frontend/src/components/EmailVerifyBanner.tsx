import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MailWarning } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import * as authService from "../services/auth.service";
import { extractErrorMessage } from "../services/api";

/**
 * The owner of a new trial who hasn't confirmed their email yet: the trial
 * is short until they click the link we sent.
 */
export function EmailVerifyBanner() {
  const { t } = useTranslation();
  const { session, reloadSession } = useAuth();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  if (!session || session.user.emailVerified !== false || session.role !== "OWNER" || !session.subscription?.isTrial) return null;

  async function resend() {
    setSending(true);
    try {
      const { alreadyVerified } = await authService.resendVerification();
      if (alreadyVerified) await reloadSession();
      else showToast({ variant: "success", title: t("verifyEmail.sent", { email: session?.user.email }) });
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="subscription-banner subscription-banner-warning" role="status">
      <MailWarning size={16} />
      <span>{t("verifyEmail.banner", { email: session.user.email, count: session.subscription.daysLeft })}</span>
      <button type="button" className="subscription-banner-action" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={resend} disabled={sending}>
        {sending ? t("common.saving") : t("verifyEmail.resend")}
      </button>
    </div>
  );
}
