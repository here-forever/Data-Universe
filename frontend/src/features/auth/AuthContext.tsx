import type { PropsWithChildren } from "react";

import type { CurrentUser } from "./api";
import { AuthContext } from "./authContextValue";

export function AuthContextProvider({
  children,
  user,
}: PropsWithChildren<{ user: CurrentUser }>) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}
