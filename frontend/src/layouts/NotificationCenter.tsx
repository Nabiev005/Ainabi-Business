import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Bell, ClipboardList, PackageX, Wallet } from "lucide-react";
import * as dashboardService from "../services/dashboard.service";
import * as debtService from "../services/debt.service";
import * as supplierService from "../services/supplier.service";
import * as taskService from "../services/task.service";
import type { Task } from "../services/task.service";
import { useToast } from "../hooks/useToast";
import { formatMoney } from "../utils/format";
import type { LowStockProduct } from "../types";

interface NotificationItem {
  id: string;
  icon: typeof Bell;
  title: string;
  subtitle: string;
  to: string;
  variant: "warning" | "danger" | "info";
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [customerDebtTotal, setCustomerDebtTotal] = useState(0);
  const [supplierDebtTotal, setSupplierDebtTotal] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unseenTasks, setUnseenTasks] = useState(0);
  // Last unseen count we knew about — a rise means a task just arrived.
  const knownUnseen = useRef<number | null>(null);
  const { showToast } = useToast();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function loadNotifications() {
    setLoading(true);
    Promise.all([
      dashboardService.getLowStock(),
      debtService.getDebtSummary().catch(() => ({ totalOutstanding: 0, openDebts: 0 })),
      supplierService.getSupplierSummary().catch(() => ({ totalOutstanding: 0, openDebts: 0 })),
      // Off the plan (402) or not allowed: just no task notifications.
      taskService.getTaskNotifications().catch(() => ({ unseen: 0, tasks: [] as Task[] })),
    ])
      .then(([stock, customerDebts, supplierDebts, myTasks]) => {
        setLowStock(stock);
        setCustomerDebtTotal(customerDebts.totalOutstanding);
        setSupplierDebtTotal(supplierDebts.totalOutstanding);
        setTasks(myTasks.tasks);
        setUnseenTasks(myTasks.unseen);
        if (knownUnseen.current !== null && myTasks.unseen > knownUnseen.current) {
          const newest = myTasks.tasks.find((task) => !task.seen);
          showToast({ variant: "info", title: t("header.taskArrived"), message: newest?.title });
        }
        knownUnseen.current = myTasks.unseen;
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadNotifications();
    // Refresh quietly every 2 minutes so the badge count stays current.
    const interval = window.setInterval(loadNotifications, 120000);
    return () => window.clearInterval(interval);
  }, []);

  const items: NotificationItem[] = [];
  if (tasks.length > 0) {
    items.push({
      id: "tasks",
      icon: ClipboardList,
      title: unseenTasks > 0 ? t("header.newTasks", { count: unseenTasks }) : t("header.openTasks", { count: tasks.length }),
      subtitle: tasks.slice(0, 3).map((task) => task.title).join(", "),
      to: "/tasks",
      variant: unseenTasks > 0 ? "danger" : "info",
    });
  }
  const outOfStock = lowStock.filter((p) => p.status === "OUT");
  const lowOnly = lowStock.filter((p) => p.status === "LOW");

  if (outOfStock.length > 0) {
    items.push({
      id: "out-of-stock",
      icon: PackageX,
      title: t("header.outOfStock", { count: outOfStock.length }),
      subtitle: outOfStock.slice(0, 3).map((p) => p.name).join(", "),
      to: "/stock",
      variant: "danger",
    });
  }
  if (lowOnly.length > 0) {
    items.push({
      id: "low-stock",
      icon: AlertTriangle,
      title: t("header.lowStock", { count: lowOnly.length }),
      subtitle: lowOnly.slice(0, 3).map((p) => p.name).join(", "),
      to: "/stock",
      variant: "warning",
    });
  }
  if (customerDebtTotal > 0) {
    items.push({
      id: "customer-debt",
      icon: Wallet,
      title: t("header.customerDebt"),
      subtitle: t("header.total", { amount: formatMoney(customerDebtTotal) }),
      to: "/debts",
      variant: "warning",
    });
  }
  if (supplierDebtTotal > 0) {
    items.push({
      id: "supplier-debt",
      icon: Wallet,
      title: t("header.supplierDebt"),
      subtitle: t("header.total", { amount: formatMoney(supplierDebtTotal) }),
      to: "/suppliers",
      variant: "warning",
    });
  }

  // Opening the bell counts as having seen the new tasks; they keep their
  // "new" wording while the panel is open and the badge clears on close.
  useEffect(() => {
    if (open && unseenTasks > 0) {
      taskService.markTasksSeen().catch(() => undefined);
      knownUnseen.current = 0;
    }
    if (!open) setUnseenTasks((n) => (knownUnseen.current === 0 ? 0 : n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={rootRef}>
      <button className="header-icon-btn" aria-label={t("header.notifications")} onClick={() => setOpen((v) => !v)}>
        <Bell size={17} />
        {unseenTasks > 0 ? (
          <span className="header-icon-count">{unseenTasks > 9 ? "9+" : unseenTasks}</span>
        ) : (
          items.length > 0 && <span className="header-icon-dot pulse-danger" />
        )}
      </button>

      {open && (
        <div className="card animate-in notification-panel">
          <div className="notification-panel-header">
            <span style={{ fontWeight: 700 }}>{t("header.notifications")}</span>
          </div>
          {loading && items.length === 0 ? (
            <div className="header-search-empty">{t("header.notificationsLoading")}</div>
          ) : items.length === 0 ? (
            <div className="header-search-empty">{t("header.notificationsEmpty")}</div>
          ) : (
            <div>
              {items.map((item) => (
                <button
                  key={item.id}
                  className="notification-item"
                  onClick={() => {
                    setOpen(false);
                    navigate(item.to);
                  }}
                >
                  <span className={`notification-item-icon notification-item-icon-${item.variant}`}>
                    <item.icon size={16} />
                  </span>
                  <span className="stack gap-1" style={{ textAlign: "left" }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{item.title}</span>
                    <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                      {item.subtitle}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
