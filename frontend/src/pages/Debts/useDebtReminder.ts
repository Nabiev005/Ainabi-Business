import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import type { Debt } from "../../types";
import { formatDate, formatMoney } from "../../utils/format";
import { whatsappLink } from "../../utils/whatsapp";

/** The ready-to-send WhatsApp reminder for a debt (null when the customer has no usable phone). */
export function useDebtReminder() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const shop = session?.business.name ?? "";
  const payInfo = session?.business.qrPaymentInfo;

  return useCallback(
    (debt: Debt) => {
      const lines = [
        t("debts.message.greeting", { name: debt.customerName }),
        t("debts.message.intro", { shop, amount: formatMoney(debt.remainingAmount) }),
      ];
      if (debt.overdueAmount > 0 && debt.nextDueDate) {
        lines.push(t("debts.message.overdue", { date: formatDate(debt.nextDueDate), days: debt.daysOverdue, due: formatMoney(debt.overdueAmount) }));
      } else if (debt.nextDueDate && debt.nextDueAmount) {
        lines.push(t("debts.message.soon", { date: formatDate(debt.nextDueDate), due: formatMoney(debt.nextDueAmount) }));
      }
      if (payInfo) lines.push(t("debts.message.pay", { info: payInfo }));
      lines.push(t("debts.message.thanks"));
      return whatsappLink(debt.customerPhone, lines.join("\n"));
    },
    [t, shop, payInfo],
  );
}
