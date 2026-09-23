import type { Product, ProductFieldDef } from "../types";
import { formatDate } from "./format";

/**
 * Short chips for a product's "show in list" fields — e.g. ["Samsung",
 * "256GB", "Жаңы"] for a phone, ["XL", "Кара"] for a jacket. Plain text
 * values are shown bare (they're self-explanatory); numbers, dates and
 * yes/no flags get their field label so "12" or a date isn't ambiguous.
 */
export function attributeChips(product: Pick<Product, "attributes">, fields: ProductFieldDef[] | undefined): string[] {
  if (!fields?.length || !product.attributes) return [];
  const chips: string[] = [];
  for (const field of fields) {
    if (!field.showInList) continue;
    const value = product.attributes[field.key];
    if (value === undefined || value === null || value === "" || value === false) continue;
    switch (field.type) {
      case "boolean":
        chips.push(field.label);
        break;
      case "number":
        chips.push(`${field.label}: ${value}`);
        break;
      case "date":
        chips.push(`${field.label}: ${formatDate(String(value))}`);
        break;
      default:
        chips.push(String(value));
    }
  }
  return chips;
}
