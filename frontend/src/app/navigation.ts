import type { LucideIcon } from "lucide-react";
import { BookOpen, FlaskConical, Orbit, TableProperties } from "lucide-react";

import type { TranslationKey } from "../i18n";

export interface NavigationItem {
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  shortLabelKey: TranslationKey;
  path: string;
  icon: LucideIcon;
  end?: boolean;
}

export const navigationItems: NavigationItem[] = [
  {
    labelKey: "nav.universe",
    descriptionKey: "nav.universeDescription",
    shortLabelKey: "nav.universeShort",
    path: "/",
    icon: Orbit,
    end: true,
  },
  {
    labelKey: "nav.data",
    descriptionKey: "nav.dataDescription",
    shortLabelKey: "nav.dataShort",
    path: "/data",
    icon: TableProperties,
  },
  {
    labelKey: "nav.analysis",
    descriptionKey: "nav.analysisDescription",
    shortLabelKey: "nav.analysisShort",
    path: "/analysis",
    icon: FlaskConical,
  },
  {
    labelKey: "nav.stories",
    descriptionKey: "nav.storiesDescription",
    shortLabelKey: "nav.storiesShort",
    path: "/stories",
    icon: BookOpen,
  },
];
