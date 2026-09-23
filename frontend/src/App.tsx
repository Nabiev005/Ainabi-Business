import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ToastStack } from "./components/ui/ToastStack";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";

const Landing = lazy(() => import("./pages/Landing/Landing"));
const Login = lazy(() => import("./pages/Auth/Login"));
const Register = lazy(() => import("./pages/Auth/Register"));
const ForgotPassword = lazy(() => import("./pages/Auth/ForgotPassword"));
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
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/pos" element={<Pos />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/shifts" element={<Shifts />} />
                  <Route path="/repairs" element={<Repairs />} />
                  <Route path="/receiving" element={<Receiving />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/labels" element={<Labels />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/stock" element={<Stock />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/customers/:id" element={<CustomerProfile />} />
                  <Route path="/debts" element={<Debts />} />
                  <Route path="/suppliers" element={<Suppliers />} />
                  <Route path="/suppliers/:id" element={<SupplierProfile />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/employees" element={<Employees />} />
                  <Route path="/settings" element={<Settings />} />
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
