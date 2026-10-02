import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Demo data with a well-known password must never land in a real database.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed is for local development only — refusing to run with NODE_ENV=production.");
  }
  const passwordHash = await bcrypt.hash("password123", 12);

  const user = await prisma.user.upsert({
    where: { email: "owner@ainabi.kg" },
    update: {},
    create: { name: "Айбек Осмонов", email: "owner@ainabi.kg", phone: "+996700123456", passwordHash },
  });

  let business = await prisma.business.findFirst({ where: { ownerId: user.id } });
  if (!business) {
    business = await prisma.business.create({ data: { name: "Ainabi Дүкөн", ownerId: user.id } });
  }

  const employee = await prisma.employee.upsert({
    where: { userId_businessId: { userId: user.id, businessId: business.id } },
    update: {},
    create: { userId: user.id, businessId: business.id, role: "OWNER", status: "ACTIVE" },
  });

  const drinks = await prisma.category.upsert({
    where: { businessId_name: { businessId: business.id, name: "Суусундуктар" } },
    update: {},
    create: { businessId: business.id, name: "Суусундуктар" },
  });
  const food = await prisma.category.upsert({
    where: { businessId_name: { businessId: business.id, name: "Азык-түлүк" } },
    update: {},
    create: { businessId: business.id, name: "Азык-түлүк" },
  });
  const snacks = await prisma.category.upsert({
    where: { businessId_name: { businessId: business.id, name: "Таттуулар" } },
    update: {},
    create: { businessId: business.id, name: "Таттуулар" },
  });

  const products = [
    { name: "Coca-Cola 1L", categoryId: drinks.id, purchasePrice: 65, salePrice: 85, quantity: 24, minQuantity: 10, barcode: "4870001234561" },
    { name: "Nan", categoryId: food.id, purchasePrice: 20, salePrice: 30, quantity: 40, minQuantity: 15, barcode: "4870001234562" },
    { name: "Snickers", categoryId: snacks.id, purchasePrice: 40, salePrice: 60, quantity: 5, minQuantity: 10, barcode: "4870001234563" },
    { name: "Fanta 1L", categoryId: drinks.id, purchasePrice: 62, salePrice: 82, quantity: 18, minQuantity: 10, barcode: "4870001234564" },
    { name: "Куурулган май 1L", categoryId: food.id, purchasePrice: 180, salePrice: 230, quantity: 12, minQuantity: 5, barcode: "4870001234565" },
  ];

  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { businessId: business.id, barcode: p.barcode } });
    if (!existing) {
      await prisma.product.create({ data: { businessId: business.id, unit: "PIECE", ...p } });
    }
  }

  let customer = await prisma.customer.findFirst({ where: { businessId: business.id, name: "Азамат" } });
  if (!customer) {
    customer = await prisma.customer.create({ data: { businessId: business.id, name: "Азамат", phone: "+996555112233" } });
  }

  console.log("Seed бүттү:");
  console.log(`  Email: owner@ainabi.kg`);
  console.log(`  Пароль: password123`);
  console.log(`  Бизнес: ${business.name}`);
  console.log(`  Кызматкер (owner) id: ${employee.id}, кардар: ${customer.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
