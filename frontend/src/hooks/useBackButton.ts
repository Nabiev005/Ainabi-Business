import { useEffect, useRef } from "react";
import { pushBackHandler } from "../utils/native";

/** While `active`, the Android back button calls `onBack` (e.g. closes a modal). */
export function useBackButton(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => onBackRef.current());
  }, [active]);
}
