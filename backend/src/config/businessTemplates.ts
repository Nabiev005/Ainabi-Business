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

interface BusinessTemplate {
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
const expiryField: TemplateField = { key: "expiryDate", label: { ky: "Жарактуулук мөөнөтү", ru: "Срок годности" }, type: "date", showInList: true };

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
    description: { ky: "IMEI эсеби, кепилдик, эс тутум, түс, абалы", ru: "Учёт IMEI, гарантия, память, цвет, состояние" },
    icon: "smartphone",
    trackSerials: true,
    trackWarranty: true,
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
    description: { ky: "Сериялык номер, кепилдик, процессор, RAM, SSD", ru: "Серийный номер, гарантия, процессор, ОЗУ, SSD" },
    icon: "laptop",
    trackSerials: true,
    trackWarranty: true,
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
    description: { ky: "Сериялык номер, кепилдик, бренд, кубаттуулук", ru: "Серийный номер, гарантия, бренд, мощность" },
    icon: "tv",
    trackSerials: true,
    trackWarranty: true,
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
    description: { ky: "Өлчөм, түс, материал, жыныс, мезгил", ru: "Размер, цвет, материал, пол, сезон" },
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
    description: { ky: "Жарактуулук мөөнөтү, өндүрүүчү", ru: "Срок годности, производитель" },
    icon: "shopping-basket",
    trackSerials: false,
    trackWarranty: false,
    categories: {
      ky: ["Сүт азыктары", "Нан азыктары", "Эт азыктары", "Суусундуктар", "Таттуулар", "Жашылча-жемиштер", "Тиричилик химиясы"],
      ru: ["Молочные продукты", "Хлебобулочные", "Мясные продукты", "Напитки", "Сладости", "Овощи и фрукты", "Бытовая химия"],
    },
    fields: [expiryField, manufacturerField],
  },
  {
    id: "PHARMACY",
    name: { ky: "Дарыкана", ru: "Аптека" },
    description: { ky: "Жарактуулук мөөнөтү, дозировка, рецепт", ru: "Срок годности, дозировка, рецепт" },
    icon: "pill",
    trackSerials: false,
    trackWarranty: false,
    categories: {
      ky: ["Дары-дармектер", "Витаминдер", "Медициналык буюмдар", "Гигиена", "Балдар үчүн"],
      ru: ["Лекарства", "Витамины", "Медицинские изделия", "Гигиена", "Для детей"],
    },
    fields: [
      { ...expiryField, required: true },
      manufacturerField,
      { key: "dosage", label: { ky: "Дозировка", ru: "Дозировка" }, type: "text", showInList: true },
      { key: "prescription", label: { ky: "Рецепт менен", ru: "По рецепту" }, type: "boolean", showInList: true },
    ],
  },
  {
    id: "COSMETICS",
    name: { ky: "Косметика жана парфюмерия", ru: "Косметика и парфюмерия" },
    description: { ky: "Бренд, көлөмү, жарактуулук мөөнөтү", ru: "Бренд, объём, срок годности" },
    icon: "sparkles",
    trackSerials: false,
    trackWarranty: false,
    categories: {
      ky: ["Бет үчүн", "Чач үчүн", "Дене үчүн", "Макияж", "Парфюмерия"],
      ru: ["Для лица", "Для волос", "Для тела", "Макияж", "Парфюмерия"],
    },
    fields: [
      { key: "brand", label: { ky: "Бренд", ru: "Бренд" }, type: "text", showInList: true },
      { key: "volume", label: { ky: "Көлөмү (мл/г)", ru: "Объём (мл/г)" }, type: "text", showInList: true },
      expiryField,
    ],
  },
  {
    id: "AUTO_PARTS",
    name: { ky: "Автозапчасттар", ru: "Автозапчасти" },
    description: { ky: "Унаа маркасы, модели, жылы, OEM номери, кепилдик", ru: "Марка, модель, год авто, OEM номер, гарантия" },
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
    description: { ky: "Өндүрүүчү, өлчөмү, түсү", ru: "Производитель, размер, цвет" },
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
