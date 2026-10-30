"use client";

import { createContext, type ReactNode, use } from "react";
import type { VorsorgebildModel } from "@/lib/advisor/types";

/** Lets widgets that change the profile update the Vorsorgebild without waiting for a turn. */
export interface PictureActions {
  setPicture: (model: VorsorgebildModel) => void;
  refreshPicture: () => void;
}

const PictureContext = createContext<PictureActions | null>(null);

export function PictureProvider({
  value,
  children,
}: {
  value: PictureActions;
  children: ReactNode;
}) {
  return <PictureContext value={value}>{children}</PictureContext>;
}

export function usePictureActions(): PictureActions | null {
  return use(PictureContext);
}
