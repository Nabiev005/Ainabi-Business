import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ToastStack } from "./components/ui/ToastStack";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequirePermission } from "./components/RequirePermission";
import { RequireFeature } from "./components/RequireFeature";
import { RequirePlatformAdmin } from "./components/RequirePlatformAdmin";
import { AppLayout } from "./layouts/AppLayout";

const Landing = lazy(() => import("./pages/Landing/Landing"));
const Login = lazy(() => import("./pages/Auth/Login"));
const Register = lazy(() => import("./pages/Auth/Register"));
const ForgotPassword = lazy(() => import("./pages/Auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/Auth/ResetPassword"));
const Privacy = lazy(() => import("./pages/Legal/Privacy"));
const Terms = lazy(() => import("./pages/Legal/Terms"));
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const Products = lazy(() => import("./pages/Products/Products"));
const Pos = lazy(() => import("./pages/Pos/Pos"));
const Stock = lazy(() => import("./pages/Stock/Stock"));
const Customers = lazy(() => import("./pages/Customers/Customers"));
const CustomerProfile = lazy(() => import("./pages/Customers/CustomerProfile"));
const Debts = lazy(() => import("./pages/Debts/Debts"));
const Suppliers = lazy(() => import("./pages/Suppliers/Suppliers"));
const SupplierProfile = lazy(() => import("./pages/Suppliers/SupplierProfile"));
const Expenses = lazy(() => import("./pages/Expenses/Expenses"));
const Reports = lazy(() => import("./pages/Reports/Reports"));
const Employees = lazy(() => import("./pages/Employees/Employees"));
const Settings = lazy(() => import("./pages/Settings/Settings"));
const Support = lazy(() => import("./pages/Support/Support"));
const Sales = lazy(() => import("./pages/Sales/Sales"));
const Receiving = lazy(() => import("./pages/Receiving/Receiving"));
const Inventory = lazy(() => import("./pages/Inventory/Inventory"));
const Labels = lazy(() => import("./pages/Labels/Labels"));
const Repairs = lazy(() => import("./pages/Repairs/Repairs"));
const Shifts = lazy(() => import("./pages/Shifts/Shifts"));
const Tasks = lazy(() => import("./pages/Tasks/Tasks"));
const Pipeline = lazy(() => import("./pages/Pipeline/Pipeline"));
const Analytics = lazy(() => import("./pages/Analytics/Analytics"));
const Assistant = lazy(() => import("./pages/Assistant/Assistant"));
const Insights = lazy(() => import("./pages/Insights/Insights"));
const Returns = lazy(() => import("./pages/Returns/Returns"));
const Stale = lazy(() => import("./pages/Stale/Stale"));
const Billing = lazy(() => import("./pages/Billing/Billing"));
const Platform = lazy(() => import("./pages/Platform/Platform"));
const NotFound = lazy(() => import("./pages/NotFound/NotFound"));

function PageFallback() {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "var(--color-text-muted)" }}>
      {t("common.loading")}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<RequirePermission permission="reports.view"><Dashboard /></RequirePermission>} />
                  <Route path="/analytics" element={<RequirePermission permission="analytics.view"><RequireFeature feature="analytics"><Analytics /></RequireFeature></RequirePermission>} />
                  <Route path="/tasks" element={<RequireFeature feature="tasks"><Tasks /></RequireFeature>} />
                  <Route path="/pipeline" element={<RequirePermission permission="pipeline.view"><RequireFeature feature="pipeline"><Pipeline /></RequireFeature></RequirePermission>} />
                  <Route path="/pos" element={<RequirePermission permission="pos.sell"><Pos /></RequirePermission>} />
                  <Route path="/sales" element={<RequirePermission permission="sales.view"><Sales /></RequirePermission>} />
                  <Route path="/shifts" element={<RequirePermission permission={["shifts.use", "shifts.viewAll"]}><Shifts /></RequirePermission>} />
                  <Route path="/repairs" element={<RequirePermission permission="repairs.manage"><RequireFeature feature="repairs"><Repairs /></RequireFeature></RequirePermission>} />
                  <Route path="/receiving" element={<RequirePermission permission="stock.receive"><RequireFeature feature="receiving"><Receiving /></RequireFeature></RequirePermission>} />
                  <Route path="/inventory" element={<RequirePermission permission="stock.inventory"><RequireFeature feature="inventory"><Inventory /></RequireFeature></RequirePermission>} />
                  <Route path="/labels" element={<RequirePermission permission="labels.print"><Labels /></RequirePermission>} />
                  <Route path="/products" element={<RequirePermission permission="products.view"><Products /></RequirePermission>} />
                  <Route path="/stock" element={<RequirePermission permission="stock.view"><Stock /></RequirePermission>} />
                  <Route path="/customers" element={<RequirePermission permission="customers.view"><Customers /></RequirePermission>} />
                  <Route path="/customers/:id" element={<RequirePermission permission="customers.view"><CustomerProfile /></RequirePermission>} />
                  <Route path="/debts" element={<RequirePermission permission="debts.view"><Debts /></RequirePermission>} />
                  <Route path="/suppliers" element={<RequirePermission permission="suppliers.view"><Suppliers /></RequirePermission>} />
                  <Route path="/suppliers/:id" element={<RequirePermission permission="suppliers.view"><SupplierProfile /></RequirePermission>} />
                  <Route path="/expenses" element={<RequirePermission permission="expenses.view"><Expenses /></RequirePermission>} />
                  <Route path="/reports" element={<RequirePermission permission="reports.view"><Reports /></RequirePermission>} />
                  <Route path="/employees" element={<RequirePermission permission="employees.manage"><Employees /></RequirePermission>} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/insights" element={<RequirePermission permission="analytics.view"><RequireFeature feature="analytics"><Insights /></RequireFeature></RequirePermission>} />
                  <Route path="/assistant" element={<RequirePermission permission="assistant.use"><RequireFeature feature="analytics"><Assistant /></RequireFeature></RequirePermission>} />
                  <Route path="/returns" element={<RequirePermission permission="returns.view"><Returns /></RequirePermission>} />
                  <Route path="/stale" element={<RequirePermission permission="stock.stale"><Stale /></RequirePermission>} />
                  <Route path="/billing" element={<RequirePermission permission="settings.business"><Billing /></RequirePermission>} />
                  <Route path="/platform" element={<RequirePlatformAdmin><Platform /></RequirePlatformAdmin>} />
                  <Route path="/support" element={<Support />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <ToastStack />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
