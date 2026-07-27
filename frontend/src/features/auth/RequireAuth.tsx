import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useI18n } from "../../i18n";
import { AuthContextProvider } from "./AuthContext";
import { getCurrentUser } from "./api";

export function RequireAuth() {
  const location = useLocation();
  const { t } = useI18n();
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 60_000,
  });

  if (currentUserQuery.isPending) {
    return (
      <main className="auth-gate" aria-live="polite">
        <div className="auth-gate-card">
          <span className="auth-gate-icon">
            <LoaderCircle className="spin" size={22} />
          </span>
          <strong>
            {t("正在验证工作区身份", "Verifying workspace identity")}
          </strong>
          <p>{t("正在建立安全会话…", "Establishing a secure session…")}</p>
        </div>
      </main>
    );
  }

  if (currentUserQuery.isError || !currentUserQuery.data) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return (
    <AuthContextProvider user={currentUserQuery.data}>
      <Outlet />
    </AuthContextProvider>
  );
}

export function AuthenticatedBadge() {
  const { t } = useI18n();
  return (
    <span className="auth-trust-badge">
      <ShieldCheck size={15} />
      {t("签名会话", "Signed session")}
    </span>
  );
}
