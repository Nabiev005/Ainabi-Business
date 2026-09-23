export type Role = "OWNER" | "ADMIN" | "CASHIER";
export type EmployeeStatus = "ACTIVE" | "INACTIVE";
export type PaymentMethod = "CASH" | "CARD" | "QR" | "DEBT";
export type ProductUnit = "PIECE" | "KG" | "GRAM" | "LITER" | "METER" | "PACK" | "BOX";
export type ProductStatus = "ACTIVE" | "ARCHIVED";
export type StockStatus = "OK" | "LOW" | "OUT";
export type StockMovementType = "IN" | "OUT" | "SALE" | "ADJUSTMENT" | "WRITE_OFF";
export type DebtStatus = "OPEN" | "PARTIAL" | "PAID";
export type ExpenseCategory = "RENT" | "SALARY" | "PURCHASE" | "TRANSPORT" | "UTILITIES" | "ADVERTISING" | "OTHER";
export type DashboardRange = "today" | "7d" | "30d" | "month";

export type AuthProvider = "PASSWORD" | "GOOGLE";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  provider: AuthProvider;
}

export type ProductFieldType = "text" | "number" | "select" | "boolean" | "date";
export type AttributeValue = string | number | boolean;

/** One of the business's own product fields (brand, RAM, size...). */
export interface ProductFieldDef {
  key: string;
  label: string;
  type: ProductFieldType;
  options?: string[];
  required: boolean;
  showInList: boolean;
}

export interface BusinessTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  trackSerials: boolean;
  trackWarranty: boolean;
  categories: string[];
  fields: ProductFieldDef[];
}

export interface Business {
  id: string;
  name: string;
  currency: string;
  phone?: string | null;
  address?: string | null;
  qrPaymentInfo?: string | null;
  businessType?: string;
  productFields?: ProductFieldDef[];
  trackSerials?: boolean;
  trackWarranty?: boolean;
}

export interface Session {
  user: User;
  business: Business;
  role: Role;
  employeeId: string;
}

export interface AuthResponse {
  accessToken: string;
  session: Session;
}

export interface Category {
  id: string;
  name: string;
  _count?: { products: number };
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  purchasePrice: number;
  salePrice: number;
  profit: number;
  marginPercent: number;
  quantity: number;
  minQuantity: number;
  unit: ProductUnit;
  imageUrl: string | null;
  description: string | null;
  attributes: Record<string, AttributeValue>;
  requiresSerial: boolean;
  warrantyMonths: number | null;
  status: ProductStatus;
  stockStatus: StockStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  purchaseCount: number;
  totalSpent: number;
  debt: number;
  lastPurchaseAt: string | null;
  createdAt: string;
}

export interface CustomerDetail extends Pick<Customer, "id" | "name" | "phone" | "notes" | "createdAt"> {
  sales: {
    id: string;
    total: number;
    paymentMethod: PaymentMethod;
    createdAt: string;
    items: { productName: string; quantity: number; price: number; serialNumbers: string[]; warrantyUntil: string | null }[];
  }[];
  debts: { id: string; totalAmount: number; paidAmount: number; remainingAmount: number; status: DebtStatus; comment: string | null; createdAt: string; payments: { id: string; amount: number; method: PaymentMethod; createdAt: string }[] }[];
}

export interface SaleListItem {
  id: string;
  total: number;
  discount: number;
  paymentMethod: PaymentMethod;
  status: string;
  customerName: string | null;
  cashierName: string;
  itemCount: number;
  createdAt: string;
}

export interface SerialLookupResult {
  serial: string;
  saleId: string;
  saleStatus: string;
  productId: string;
  productName: string;
  price: number;
  warrantyUntil: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  cashierName: string;
  soldAt: string;
}

export interface Debt {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: DebtStatus;
  comment: string | null;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  totalPurchased: number;
  debt: number;
  lastDeliveryAt: string | null;
  createdAt: string;
}

export interface SupplierDebtPayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  createdAt: string;
}

export interface SupplierDebt {
  id: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: DebtStatus;
  comment: string | null;
  createdAt: string;
  payments: SupplierDebtPayment[];
}

export interface SupplierDetail {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  createdAt: string;
  deliveries: {
    id: string;
    productName: string;
    quantity: number;
    purchasePrice: number | null;
    total: number | null;
    createdAt: string;
  }[];
  debts: SupplierDebt[];
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  comment: string | null;
  addedBy: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: EmployeeStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  purchasePrice: number | null;
  supplierName: string | null;
  employeeName: string | null;
  comment: string | null;
  createdAt: string;
}

export interface DashboardKpi {
  revenue: { value: number; changePercent: number };
  netProfit: { value: number; changePercent: number };
  salesCount: { value: number; changePercent: number };
  avgCheck: { value: number; changePercent: number };
  stockQuantity: { value: number };
  totalDebt: { value: number };
}

export interface DashboardSummary {
  range: DashboardRange;
  kpi: DashboardKpi;
}

export interface SalesDynamicsPoint {
  date: string;
  label: string;
  sales: number;
  expenses: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  categoryName: string | null;
  soldQuantity: number;
  revenue: number;
}

export interface LowStockProduct {
  id: string;
  name: string;
  quantity: number;
  minQuantity: number;
  unit: ProductUnit;
  status: "LOW" | "OUT";
}
