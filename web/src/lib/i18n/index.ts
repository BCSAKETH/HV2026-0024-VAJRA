import en, { type Dictionary } from "./en";
import hi from "./hi";
import te from "./te";

export type { Dictionary };
export type { Locale } from "../store/locale";

export const dictionaries = { en, te, hi } as const;
