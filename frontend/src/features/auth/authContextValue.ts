import { createContext } from "react";

import type { CurrentUser } from "./api";

export const AuthContext = createContext<CurrentUser | null>(null);
