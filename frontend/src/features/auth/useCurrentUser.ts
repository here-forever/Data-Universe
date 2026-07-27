import { useContext } from "react";

import { AuthContext } from "./authContextValue";

export function useCurrentUser() {
  return useContext(AuthContext);
}
