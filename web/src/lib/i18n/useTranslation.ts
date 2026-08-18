"use client";

import { useLocaleStore } from "../store/locale";
import { dictionaries } from "./index";

// Returns the whole nested dictionary object for the active locale, not a
// t("dotted.key") string-lookup function — call sites write t.staff.roster
// directly, which is fully typed/autocompleted and can never typo a key
// into a silent runtime fallback.
export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  return { t: dictionaries[locale], locale, setLocale };
}
