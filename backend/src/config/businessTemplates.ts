import type { Lang } from "../i18n/messages";

/**
 * Ready-made starting points for different kinds of shops. Picking one only
 * *seeds* the business: its categories get created and its product fields
 * get added to Business.productFields. After that everything is the owner's
 * to rename, delete or extend — nothing in the app branches on the type id.
 *
 * Labels/options come in both UI languages and are materialised in the
 * language of whoever applies the template (field values are free text the
 * shop types, so a single-language label is what they'll expect to see).
 */

export type ProductFieldType = "text" | "number" | "select" | "boolean" | "date";

type Localized<T> = Record<Lang, T>;

interface TemplateField {
  key: string;
  label: Localized<string>;
  type: ProductFieldType;
  options?: Localized<string[]> | string[];
  required?: boolean;
  showInList?: boolean;
}

export interface TemplateModules {
  trackSerials: boolean;
  trackWarranty: boolean;
  trackExpiry: boolean;
  enableRepairs: boolean;
  weightBarcodes: boolean;
  checkPrescription: boolean;
}

export const MODULE_KEYS: (keyof TemplateModules)[] = [
  "trackSerials",
  "trackWarranty",
  "trackExpiry",
  "enableRepairs",
  "weightBarcodes",
  "checkPrescription",
];

interface BusinessTemplate extends Partial<TemplateModules> {
  id: string;
  name: Localized<string>;
  description: Localized<string>;
  icon: string;
  trackSerials: boolean;
  trackWarranty: boolean;
  categories: Localized<string[]>;
  fields: TemplateField[];
}

const CONDITION: Localized<string[]> = {
  ky: ["Жаңы", "Колдонулган", "Калыбына келтирилген"],
  ru: ["Новый", "Б/у", "Восстановленный"],
};
const OTHER = { ky: "Башка", ru: "Другое" };

const brandField = (brands: string[], showInList = true): TemplateField => ({
  key: "brand",
  label: { ky: "Бренд", ru: "Бренд" },
  type: "select",
  options: { ky: [...brands, OTHER.ky], ru: [...brands, OTHER.ru] },
  showInList,
});
const modelField: TemplateField = { key: "model", label: { ky: "Модели", ru: "Модель" }, type: "text", showInList: true };
const colorField: TemplateField = { key: "color", label: { ky: "Түсү", ru: "Цвет" }, type: "text", showInList: true };
const conditionField: TemplateField = { key: "condition", label: { ky: "Абалы", ru: "Состояние" }, type: "select", options: CONDITION, showInList: true };
const manufacturerField: TemplateField = { key: "manufacturer", label: { ky: "Өндүрүүчү", ru: "Производитель" }, type: "text" };

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: "GENERAL",
    name: { ky: "Жалпы дүкөн", ru: "Общий магазин" },
    description: { ky: "Кошумча талаасыз жөнөкөй каталог", ru: "Простой каталог без дополнительных полей" },
    icon: "store",
    trackSerials: false,
    trackWarranty: false,
    categories: { ky: ["Жалпы"], ru: ["Общее"] },
    fields: [],
  },
  {
    id: "PHONES",
    name: { ky: "Телефон дүкөнү", ru: "Магазин телефонов" },
    description: { ky: "IMEI эсеби, кепилдик, ремонт, trade-in, эс тутум, түс", ru: "Учёт IMEI, гарантия, ремонт, trade-in, память, цвет" },
    icon: "smartphone",
    trackSerials: true,
    trackWarranty: true,
    enableRepairs: true,
    categories: {
      ky: ["Смартфондор", "Кнопкалуу телефондор", "Планшеттер", "Кулакчындар", "Кубаттагычтар", "Чехолдор", "Аксессуарлар"],
      ru: ["Смартфоны", "Кнопочные телефоны", "Планшеты", "Наушники", "Зарядные устройства", "Чехлы", "Аксессуары"],
    },
    fields: [
      brandField(["Apple", "Samsung", "Xiaomi", "Redmi", "Poco", "Honor", "Huawei", "Realme", "Tecno", "Infinix", "Vivo", "Oppo"]),
      modelField,
      { key: "storage", label: { ky: "Эс тутум", ru: "Память" }, type: "select", options: ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"], showInList: true },
      { key: "ram", label: { ky: "RAM", ru: "ОЗУ" }, type: "select", options: ["2GB", "3GB", "4GB", "6GB", "8GB", "12GB", "16GB"] },
      colorField,
      conditionField,
    ],
  },
  {
    id: "LAPTOPS",
    name: { ky: "Ноутбук жана компьютер", ru: "Ноутбуки и компьютеры" },
    description: { ky: "Сериялык номер, кепилдик, ремонт, процессор, RAM, SSD", ru: "Серийный номер, гарантия, ремонт, процессор, ОЗУ, SSD" },
    icon: "laptop",
    trackSerials: true,
    trackWarranty: true,
    enableRepairs: true,
    categories: {
      ky: ["Ноутбуктар", "Компьютерлер", "Мониторлор", "Комплектөөчүлөр", "Чычкан жана клавиатура", "Принтерлер", "Аксессуарлар"],
      ru: ["Ноутбуки", "Компьютеры", "Мониторы", "Комплектующие", "Мыши и клавиатуры", "Принтеры", "Аксессуары"],
    },
    fields: [
      brandField(["Apple", "Lenovo", "HP", "Dell", "Asus", "Acer", "MSI", "Huawei", "Samsung"]),
      modelField,
      { key: "cpu", label: { ky: "Процессор", ru: "Процессор" }, type: "text", showInList: true },
      { key: "ram", label: { ky: "RAM", ru: "ОЗУ" }, type: "select", options: ["4GB", "8GB", "16GB", "32GB", "64GB"], showInList: true },
      { key: "storage", label: { ky: "Диск (SSD/HDD)", ru: "Диск (SSD/HDD)" }, type: "text", showInList: true },
      { key: "gpu", label: { ky: "Видеокарта", ru: "Видеокарта" }, type: "text" },
      { key: "screen", label: { ky: "Экран (дюйм)", ru: "Экран (дюймы)" }, type: "number" },
      conditionField,
    ],
  },
  {
    id: "APPLIANCES",
    name: { ky: "Тиричилик техникасы", ru: "Бытовая техника" },
    description: { ky: "Сериялык номер, кепилдик, сервис, бренд, кубаттуулук", ru: "Серийный номер, гарантия, сервис, бренд, мощность" },
    icon: "tv",
    trackSerials: true,
    trackWarranty: true,
    enableRepairs: true,
    categories: {
      ky: ["Чоң техника", "Кичи техника", "Телевизорлор", "Аудио", "Ашкана техникасы", "Климат техникасы"],
      ru: ["Крупная техника", "Мелкая техника", "Телевизоры", "Аудио", "Кухонная техника", "Климатическая техника"],
    },
    fields: [
      brandField(["Samsung", "LG", "Artel", "Beko", "Bosch", "Philips", "Xiaomi", "Midea", "Haier"]),
      modelField,
      { key: "power", label: { ky: "Кубаттуулугу (Вт)", ru: "Мощность (Вт)" }, type: "number" },
      colorField,
    ],
  },
  {
    id: "CLOTHING",
    name: { ky: "Кийим жана бут кийим", ru: "Одежда и обувь" },
    description: { ky: "Өлчөм × түс варианттары, материал, мезгил", ru: "Варианты размер × цвет, материал, сезон" },
    icon: "shirt",
    trackSerials: false,
    trackWarranty: false,
    categories: {
      ky: ["Эркектер кийими", "Аялдар кийими", "Балдар кийими", "Бут кийим", "Аксессуарлар"],
      ru: ["Мужская одежда", "Женская одежда", "Детская одежда", "Обувь", "Аксессуары"],
    },
    fields: [
      { key: "size", label: { ky: "Өлчөмү", ru: "Размер" }, type: "text", showInList: true },
      colorField,
      { key: "material", label: { ky: "Материал", ru: "Материал" }, type: "text" },
      {
        key: "gender",
        label: { ky: "Кимге", ru: "Для кого" },
        type: "select",
        options: { ky: ["Эркектер", "Аялдар", "Балдар", "Унисекс"], ru: ["Мужское", "Женское", "Детское", "Унисекс"] },
        showInList: true,
      },
      {
        key: "season",
        label: { ky: "Мезгил", ru: "Сезон" },
        type: "select",
        options: { ky: ["Жай", "Кыш", "Күз-Жаз", "Бардык мезгил"], ru: ["Лето", "Зима", "Демисезон", "Всесезонное"] },
      },
    ],
  },
  {
    id: "GROCERY",
    name: { ky: "Азык-түлүк", ru: "Продукты" },
    description: { ky: "Партия жана жарактуулук мөөнөтү, тараза штрих-коду", ru: "Партии и сроки годности, весовые штрих-коды" },
    icon: "shopping-basket",
    trackSerials: false,
    trackWarranty: false,
    trackExpiry: true,
    weightBarcodes: true,
    categories: {
      ky: ["Сүт азыктары", "Нан азыктары", "Эт азыктары", "Суусундуктар", "Таттуулар", "Жашылча-жемиштер", "Тиричилик химиясы"],
      ru: ["Молочные продукты", "Хлебобулочные", "Мясные продукты", "Напитки", "Сладости", "Овощи и фрукты", "Бытовая химия"],
    },
    fields: [manufacturerField],
  },
  {
    id: "PHARMACY",
    name: { ky: "Дарыкана", ru: "Аптека" },
    description: { ky: "Партия жана мөөнөт, рецепт текшерүү, пластинка менен сатуу", ru: "Партии и сроки, проверка рецепта, продажа блистерами" },
    icon: "pill",
    trackSerials: false,
    trackWarranty: false,
    trackExpiry: true,
    checkPrescription: true,
    categories: {
      ky: ["Дары-дармектер", "Витаминдер", "Медициналык буюмдар", "Гигиена", "Балдар үчүн"],
      ru: ["Лекарства", "Витамины", "Медицинские изделия", "Гигиена", "Для детей"],
    },
    fields: [
      manufacturerField,
      { key: "dosage", label: { ky: "Дозировка", ru: "Дозировка" }, type: "text", showInList: true },
      { key: "form", label: { ky: "Формасы", ru: "Форма выпуска" }, type: "text" },
    ],
  },
  {
    id: "COSMETICS",
    name: { ky: "Косметика жана парфюмерия", ru: "Косметика и парфюмерия" },
    description: { ky: "Бренд, көлөмү, партия жана жарактуулук мөөнөтү", ru: "Бренд, объём, партии и сроки годности" },
    icon: "sparkles",
    trackSerials: false,
    trackWarranty: false,
    trackExpiry: true,
    categories: {
      ky: ["Бет үчүн", "Чач үчүн", "Дене үчүн", "Макияж", "Парфюмерия"],
      ru: ["Для лица", "Для волос", "Для тела", "Макияж", "Парфюмерия"],
    },
    fields: [
      { key: "brand", label: { ky: "Бренд", ru: "Бренд" }, type: "text", showInList: true },
      { key: "volume", label: { ky: "Көлөмү (мл/г)", ru: "Объём (мл/г)" }, type: "text", showInList: true },
    ],
  },
  {
    id: "AUTO_PARTS",
    name: { ky: "Автозапчасттар", ru: "Автозапчасти" },
    description: { ky: "Унаа маркасы, модели, OEM номери, аналогдор, кепилдик", ru: "Марка и модель авто, OEM номер, аналоги, гарантия" },
    icon: "car",
    trackSerials: false,
    trackWarranty: true,
    categories: {
      ky: ["Кыймылдаткыч", "Жүрүш бөлүгү", "Тормоз системасы", "Электрика", "Майлар жана суюктуктар", "Кузов", "Шиналар жана дисктер"],
      ru: ["Двигатель", "Ходовая часть", "Тормозная система", "Электрика", "Масла и жидкости", "Кузов", "Шины и диски"],
    },
    fields: [
      { key: "carMake", label: { ky: "Унаа маркасы", ru: "Марка авто" }, type: "text", showInList: true },
      { key: "carModel", label: { ky: "Унаанын модели", ru: "Модель авто" }, type: "text", showInList: true },
      { key: "carYear", label: { ky: "Чыккан жылы", ru: "Год выпуска" }, type: "text" },
      { key: "oemNumber", label: { ky: "OEM номери", ru: "OEM номер" }, type: "text", showInList: true },
      manufacturerField,
    ],
  },
  {
    id: "BUILDING",
    name: { ky: "Курулуш материалдары", ru: "Стройматериалы" },
    description: { ky: "Мешок/кг/даана сыяктуу бир нече бирдик, дүң баа", ru: "Несколько единиц (мешок/кг/шт), оптовая цена" },
    icon: "hammer",
    trackSerials: false,
    trackWarranty: false,
    categories: {
      ky: ["Цемент жана аралашмалар", "Боёктор", "Сантехника", "Электрика", "Шаймандар", "Жыгач материалдары"],
      ru: ["Цемент и смеси", "Краски", "Сантехника", "Электрика", "Инструменты", "Пиломатериалы"],
    },
    fields: [manufacturerField, { key: "dimensions", label: { ky: "Өлчөмү", ru: "Размер" }, type: "text", showInList: true }, colorField],
  },
];

export const BUSINESS_TYPE_IDS = BUSINESS_TEMPLATES.map((t) => t.id);

export function findTemplate(id: string) {
  return BUSINESS_TEMPLATES.find((t) => t.id === id);
}

/** A template with every label/option resolved to one language — what the
 * API returns and what gets written into Business.productFields. */
export function localizeTemplate(template: BusinessTemplate, lang: Lang) {
  return {
    id: template.id,
    name: template.name[lang],
    description: template.description[lang],
    icon: template.icon,
    trackSerials: template.trackSerials,
    trackWarranty: template.trackWarranty,
    trackExpiry: template.trackExpiry ?? false,
    enableRepairs: template.enableRepairs ?? false,
    weightBarcodes: template.weightBarcodes ?? false,
    checkPrescription: template.checkPrescription ?? false,
    categories: template.categories[lang],
    fields: template.fields.map((f) => ({
      key: f.key,
      label: f.label[lang],
      type: f.type,
      ...(f.options ? { options: Array.isArray(f.options) ? f.options : f.options[lang] } : {}),
      required: f.required ?? false,
      showInList: f.showInList ?? false,
    })),
  };
}
