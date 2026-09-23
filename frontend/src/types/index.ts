export type Role = "OWNER" | "ADMIN" | "CASHIER";
export type EmployeeStatus = "ACTIVE" | "INACTIVE";
export type PaymentMethod = "CASH" | "CARD" | "QR" | "DEBT";
export type ProductUnit = "PIECE" | "KG" | "GRAM" | "LITER" | "METER" | "PACK" | "BOX";
export type ProductStatus = "ACTIVE" | "ARCHIVED";
export type StockStatus = "OK" | "LOW" | "OUT";
export type StockMovementType = "IN" | "OUT" | "SALE" | "ADJUSTMENT" | "WRITE_OFF" | "RETURN" | "TRANSFER";
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

/** Optional modules a business can switch on (Settings → product setup). */
export interface BusinessModules {
  trackSerials: boolean;
  trackWarranty: boolean;
  trackExpiry: boolean;
  enableRepairs: boolean;
  requireShift: boolean;
  weightBarcodes: boolean;
  checkPrescription: boolean;
}

export interface BusinessTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  trackSerials: boolean;
  trackWarranty: boolean;
  trackExpiry: boolean;
  enableRepairs: boolean;
  weightBarcodes: boolean;
  checkPrescription: boolean;
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
  trackExpiry?: boolean;
  enableRepairs?: boolean;
  requireShift?: boolean;
  weightBarcodes?: boolean;
  checkPrescription?: boolean;
}

export interface Session {
  user: User;
  business: Business;
  role: Role;
  employeeId: string;
  /** The employee's own branch (null = the default one). */
  locationId?: string | null;
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
  prescriptionRequired: boolean;
  scaleCode: string | null;
  wholesalePrice: number | null;
  variantGroupId: string | null;
  variantGroupName: string | null;
  variantLabel: string | null;
  packages: ProductPackage[];
  /** Stock at the branch asked for (only when a locationId was passed). */
  locationQuantity?: number;
  status: ProductStatus;
  stockStatus: StockStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPackage {
  id?: string;
  name: string;
  factor: number;
  barcode: string | null;
  salePrice: number | null;
}

/** What a scanned code resolved to, beyond the product itself. */
export interface ScanInfo {
  packageId: string | null;
  packageName: string | null;
  factor: number;
  /** Weight read from a scale label. */
  quantity: number | null;
}

export type ScannedProduct = Product & { scan: ScanInfo | null };

export interface VariantDimension {
  name: string;
  values: string[];
}

export interface VariantGroup {
  id: string;
  name: string;
  dimensions: VariantDimension[];
  variants: Product[];
}

export interface ProductSerialUnit {
  id: string;
  serial: string;
  status: "IN_STOCK" | "SOLD";
  createdAt: string;
  soldAt: string | null;
}

export interface ProductBatch {
  id: string;
  batchNumber: string | null;
  expiryDate: string | null;
  initialQuantity: number;
  quantity: number;
  createdAt: string;
}

export interface ExpiringBatch {
  id: string;
  productId: string;
  productName: string;
  unit: ProductUnit;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  value: number;
  expired: boolean;
  daysLeft: number | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  archived: boolean;
  employeeCount: number;
  stockQuantity: number;
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
  isWholesale: boolean;
  purchaseCount: number;
  totalSpent: number;
  debt: number;
  lastPurchaseAt: string | null;
  createdAt: string;
}

export interface CustomerDetail extends Pick<Customer, "id" | "name" | "phone" | "notes" | "createdAt" | "isWholesale"> {
  sales: {
    id: string;
    total: number;
    paymentMethod: PaymentMethod;
    createdAt: string;
    items: {
      productName: string;
      quantity: number;
      price: number;
      serialNumbers: string[];
      warrantyUntil: string | null;
    }[];
  }[];
  debts: { id: string; totalAmount: number; paidAmount: number; remainingAmount: number; status: DebtStatus; comment: string | null; createdAt: string; payments: { id: string; amount: number; method: PaymentMethod; createdAt: string }[] }[];
}

export interface SaleListItem {
  id: string;
  number: number | null;
  total: number;
  discount: number;
  returnedTotal: number;
  paymentMethod: PaymentMethod;
  status: string;
  customerName: string | null;
  cashierName: string;
  itemCount: number;
  createdAt: string;
}

export interface SerialLookupResult {
  serial: string;
  /** null when the unit is on the shelf (inStock). */
  saleId: string | null;
  saleNumber: number | null;
  saleStatus: string;
  returned: boolean;
  inStock: boolean;
  productId: string;
  productName: string;
  price: number;
  warrantyUntil: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  cashierName: string | null;
  soldAt: string | null;
}

export interface SaleDetailItem {
  id: string;
  productId: string;
  productName: string;
  unit: ProductUnit;
  quantity: number;
  price: number;
  total: number;
  packageName: string | null;
  packageQuantity: number | null;
  returnedQuantity: number;
  serialNumbers: string[];
  returnedSerials: string[];
  warrantyUntil: string | null;
}

export interface SaleDetail {
  id: string;
  number: number | null;
  subtotal: number;
  discount: number;
  total: number;
  returnedTotal: number;
  paymentMethod: PaymentMethod;
  priceLevel: "RETAIL" | "WHOLESALE";
  status: string;
  customer: { id: string; name: string; phone: string | null } | null;
  cashierName: string;
  locationName: string | null;
  items: SaleDetailItem[];
  returns: {
    id: string;
    total: number;
    refundMethod: PaymentMethod;
    reason: string | null;
    employeeName: string;
    createdAt: string;
    items: { productName: string; quantity: number; total: number; serialNumbers: string[] }[];
  }[];
  createdAt: string;
}

export interface PurchaseReceiptListItem {
  id: string;
  number: number;
  type: "PURCHASE" | "TRADE_IN";
  supplierName: string | null;
  sellerName: string | null;
  docNumber: string | null;
  locationName: string | null;
  employeeName: string;
  total: number;
  paidAmount: number;
  itemCount: number;
  createdAt: string;
}

export interface PurchaseReceiptDetail {
  id: string;
  number: number;
  type: "PURCHASE" | "TRADE_IN";
  supplier: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  sellerName: string | null;
  docNumber: string | null;
  locationName: string | null;
  employeeName: string;
  total: number;
  paidAmount: number;
  paymentMethod: PaymentMethod | null;
  supplierDebtId: string | null;
  comment: string | null;
  createdAt: string;
  items: {
    id: string;
    productId: string;
    productName: string;
    barcode: string | null;
    salePrice: number;
    unit: ProductUnit;
    quantity: number;
    purchasePrice: number;
    total: number;
    batchNumber: string | null;
    expiryDate: string | null;
    serialNumbers: string[];
  }[];
}

export interface InventoryCountListItem {
  id: string;
  number: number;
  locationName: string | null;
  employeeName: string;
  itemsCount: number;
  shortageValue: number;
  surplusValue: number;
  comment: string | null;
  createdAt: string;
}

export interface InventoryCountDetail extends Omit<InventoryCountListItem, "itemsCount"> {
  items: { productId: string; productName: string; unit: ProductUnit; expectedQty: number; countedQty: number; difference: number; costPrice: number }[];
}

export type RepairStatus = "RECEIVED" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";

export interface RepairOrder {
  id: string;
  number: number;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  device: string;
  serial: string | null;
  problem: string;
  notes: string | null;
  estimatedPrice: number | null;
  prepayment: number;
  finalPrice: number | null;
  dueAmount: number;
  paymentMethod: PaymentMethod | null;
  status: RepairStatus;
  employeeName: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
}

export interface CashShiftBreakdown {
  openingCash: number;
  cashSales: number;
  cardSales: number;
  qrSales: number;
  debtSales: number;
  salesCount: number;
  cashRefunds: number;
  debtPaymentsCash: number;
  repairCash: number;
  purchasesCash: number;
  cashIn: number;
  cashOut: number;
}

export interface CashShift {
  id: string;
  status: "OPEN" | "CLOSED";
  employeeName: string | null;
  locationName: string | null;
  openedAt: string;
  closedAt: string | null;
  note: string | null;
  breakdown: CashShiftBreakdown;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  movements: { id: string; type: "IN" | "OUT"; amount: number; reason: string | null; createdAt: string }[];
}

export interface CashShiftListItem {
  id: string;
  status: "OPEN" | "CLOSED";
  employeeName: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
}

export interface DashboardAlerts {
  modules: { trackExpiry: boolean; enableRepairs: boolean; requireShift: boolean };
  expiringBatches: { id: string; productName: string; unit: ProductUnit; quantity: number; expiryDate: string | null; daysLeft: number | null }[];
  expiredCount: number;
  readyRepairs: number;
  activeRepairs: number;
  openShift: { id: string; openedAt: string } | null;
  lowStockCount: number;
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
  locationId: string | null;
  locationName: string | null;
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
  locationName: string | null;
  toLocationName: string | null;
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
